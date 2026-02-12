# Use node:18-slim for better compatibility with Prisma/OpenSSL
FROM node:18-slim

# Set the working directory
WORKDIR /app

# Install OpenSSL (required for Prisma)
RUN apt-get update -y && apt-get install -y openssl

# Copy package.json and package-lock.json first to leverage Docker cache
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy prisma directory for generation
COPY prisma ./prisma/

# Generate Prisma Client
RUN npx prisma generate

# Copy the rest of the application code
COPY . .

# Expose the port the app runs on
# Railway will set the PORT environment variable, but this is good documentation
EXPOSE 5000

# Define the command to run the app
CMD ["npm", "start"]
