#!/bin/bash
set -e

# Darkroot Production Deployment Script
# Deploys from lordran-home to VPS via SSH jumpbox

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="/srv/dev/darkroot"
VPS_DIR="/opt/darkroot"
JUMPBOX="lordran-home"
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

# Step 3: Build frontend locally (faster than on VPS)
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
echo -e "${BLUE}📁 Creating deployment package...${NC}"
TEMP_DIR="/tmp/darkroot-deploy-$(date +%s)"
mkdir -p "$TEMP_DIR"

# Copy necessary files
cp -r docker-compose.prod.yml "$TEMP_DIR/"
cp -r synapse "$TEMP_DIR/"
cp -r nginx "$TEMP_DIR/"
cp -r client/build "$TEMP_DIR/client-build"
cp -r .env.example "$TEMP_DIR/"

echo -e "${GREEN}✓ Package created at $TEMP_DIR${NC}"

# Step 5: Transfer to VPS via jumpbox
echo -e "${BLUE}📤 Transferring to VPS...${NC}"

# First, copy to jumpbox
echo "  → Copying to $JUMPBOX..."
rsync -avz --delete "$TEMP_DIR/" "$JUMPBOX:/tmp/darkroot-deploy/"

# Then, copy from jumpbox to VPS
echo "  → Copying to $VPS..."
ssh "$JUMPBOX" "rsync -avz --delete /tmp/darkroot-deploy/ $VPS:$VPS_DIR/"

echo -e "${GREEN}✓ Files transferred${NC}"

# Step 6: Deploy on VPS
echo -e "${BLUE}🔧 Deploying on VPS...${NC}"

ssh "$JUMPBOX" "ssh $VPS 'cd $VPS_DIR && \
    # Create .env.prod if it doesn't exist
    if [ ! -f .env.prod ]; then
        cp .env.example .env.prod
        echo \"⚠ Created .env.prod - please update with production values\"
    fi && \
    # Copy built frontend to correct location
    rm -rf client/build && \
    mkdir -p client && \
    mv client-build client/build && \
    # Pull/restart Docker services
    docker compose -f docker-compose.prod.yml pull && \
    docker compose -f docker-compose.prod.yml up -d --build && \
    # Health check
    sleep 5 && \
    docker compose -f docker-compose.prod.yml ps
'"

echo -e "${GREEN}✓ Deployment complete${NC}"

# Step 7: Cleanup
echo -e "${BLUE}🧹 Cleaning up...${NC}"
rm -rf "$TEMP_DIR"
ssh "$JUMPBOX" "rm -rf /tmp/darkroot-deploy"

echo -e "${GREEN}✓ Cleanup complete${NC}"

# Step 8: Health check
echo -e "${BLUE}🏥 Running health checks...${NC}"

echo "  Checking Synapse..."
if ssh "$JUMPBOX" "ssh $VPS 'curl -sf http://localhost:8008/health'" > /dev/null 2>&1; then
    echo -e "${GREEN}  ✓ Synapse is healthy${NC}"
else
    echo -e "${YELLOW}  ⚠ Synapse health check failed${NC}"
fi

echo "  Checking Nginx..."
if ssh "$JUMPBOX" "ssh $VPS 'curl -sf http://localhost/health'" > /dev/null 2>&1; then
    echo -e "${GREEN}  ✓ Nginx is healthy${NC}"
else
    echo -e "${YELLOW}  ⚠ Nginx health check failed${NC}"
fi

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ Deployment Successful!${NC}"
echo ""
echo "Access your app at:"
echo -e "${BLUE}  → http://chat.warrenmcgrail.com${NC} (HTTP)"
echo -e "${BLUE}  → https://chat.warrenmcgrail.com${NC} (HTTPS - after SSL setup)"
echo ""
echo "Useful commands:"
echo "  View logs:    ssh $JUMPBOX \"ssh $VPS 'docker compose -f $VPS_DIR/docker-compose.prod.yml logs -f'\""
echo "  Restart:      ssh $JUMPBOX \"ssh $VPS 'docker compose -f $VPS_DIR/docker-compose.prod.yml restart'\""
echo "  Stop:         ssh $JUMPBOX \"ssh $VPS 'docker compose -f $VPS_DIR/docker-compose.prod.yml down'\""
echo ""
