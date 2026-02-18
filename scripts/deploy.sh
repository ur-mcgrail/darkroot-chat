#!/bin/bash
set -e

# Darkroot Production Deployment Script
# Run from lordran-home — deploys directly to VPS via SSH

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
PROJECT_DIR="/srv/dev/darkroot"
VPS_DIR="/opt/darkroot"
VPS="vps"

echo -e "${BLUE}🚀 Darkroot Production Deployment${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Step 1: Verify we're in the project directory
if [ ! -f "docker-compose.prod.yml" ]; then
    echo -e "${RED}✗ Error: docker-compose.prod.yml not found${NC}"
    echo "  Run this script from the project root: $PROJECT_DIR"
    exit 1
fi
echo -e "${GREEN}✓ Project directory verified${NC}"

# Step 2: Check for uncommitted changes
if [ -d ".git" ]; then
    if ! git diff-index --quiet HEAD --; then
        echo -e "${YELLOW}⚠ Warning: You have uncommitted changes${NC}"
        read -p "  Continue anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
    echo -e "${GREEN}✓ Git status checked${NC}"
fi

# Step 3: Build frontend locally
echo -e "${BLUE}📦 Building frontend...${NC}"
cd client
npm ci --prefer-offline
npm run build

if [ ! -d "build" ]; then
    echo -e "${RED}✗ Build failed: build directory not found${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Frontend built successfully${NC}"
cd ..

# Step 4: Create deployment package
# NOTE: We do NOT include synapse/ — production homeserver.yaml and signing key
#       live only on the VPS and must never be overwritten from dev.
echo -e "${BLUE}📁 Creating deployment package...${NC}"
TEMP_DIR="/tmp/darkroot-deploy-$(date +%s)"
mkdir -p "$TEMP_DIR/client"

cp docker-compose.prod.yml "$TEMP_DIR/"
cp -r nginx "$TEMP_DIR/"
cp -r client/build "$TEMP_DIR/client/build"

echo -e "${GREEN}✓ Package created (frontend + nginx + compose)${NC}"

# Step 5: Transfer to VPS
echo -e "${BLUE}📤 Transferring to VPS...${NC}"
rsync -avz --delete \
    --exclude='synapse/' \
    "$TEMP_DIR/" "$VPS:$VPS_DIR/"
echo -e "${GREEN}✓ Files transferred${NC}"

# Step 6: Deploy on VPS
echo -e "${BLUE}🔧 Deploying on VPS...${NC}"
ssh "$VPS" "cd $VPS_DIR && \
    docker compose -f docker-compose.prod.yml pull && \
    docker compose -f docker-compose.prod.yml up -d && \
    sleep 5 && \
    docker compose -f docker-compose.prod.yml ps"
echo -e "${GREEN}✓ Deployment complete${NC}"

# Step 7: Cleanup
echo -e "${BLUE}🧹 Cleaning up...${NC}"
rm -rf "$TEMP_DIR"
echo -e "${GREEN}✓ Cleanup complete${NC}"

# Step 8: Health checks
echo -e "${BLUE}🏥 Running health checks...${NC}"

echo "  Checking Synapse..."
if ssh "$VPS" "curl -sf http://localhost:8008/health" > /dev/null 2>&1; then
    echo -e "${GREEN}  ✓ Synapse is healthy${NC}"
else
    echo -e "${RED}  ✗ Synapse health check failed — check logs${NC}"
fi

echo "  Checking frontend..."
if curl -sf https://chat.warrenmcgrail.com > /dev/null 2>&1; then
    echo -e "${GREEN}  ✓ Site is reachable${NC}"
else
    echo -e "${YELLOW}  ⚠ Site not reachable from lordran-home${NC}"
fi

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
echo "Useful commands:"
echo "  Logs:     ssh $VPS 'docker compose -f $VPS_DIR/docker-compose.prod.yml logs -f'"
echo "  Restart:  ssh $VPS 'docker compose -f $VPS_DIR/docker-compose.prod.yml restart'"
echo "  Status:   ssh $VPS 'docker compose -f $VPS_DIR/docker-compose.prod.yml ps'"
