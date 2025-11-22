FROM node:20-slim

WORKDIR /app

# Only install production dependencies we actually need
RUN npm init -y && npm install dotenv ethers

# Copy source files
COPY server.js ./
COPY TapBet.abi.json ./

# Expose port
EXPOSE 3001

# Run server
CMD ["node", "server.js"]
