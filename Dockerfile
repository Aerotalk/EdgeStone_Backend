# Use node:20-slim for compatibility with latest dependencies
FROM node:20-slim

# Set the working directory
WORKDIR /app

# Install OpenSSL (required for Prisma)
RUN apt-get update -y && apt-get install -y openssl

# Copy package files
COPY package*.json ./

# Copy prisma directory BEFORE installing dependencies
# This is required because 'npm ci' runs 'postinstall' which runs 'prisma generate'
COPY prisma ./prisma/

# Install dependencies
RUN npm ci --only=production

# Generate Prisma Client (explicitly run it again just in case, though postinstall does it)
RUN npx prisma generate

# Copy the rest of the application code
COPY . .

# Expose the port the app runs on
EXPOSE 5000

# Define the command to run the app
CMD ["npm", "start"]
