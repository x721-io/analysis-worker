# Use Node.js as the base image
FROM node:20.9.0-alpine3.18

RUN apk update && apk add --no-cache python3 make g++ xdg-utils

# Set the working directory
WORKDIR /usr/src/app/u2u-server-worker-analysis

# Install the Nest CLI globally
RUN yarn global add @nestjs/cli

# Copy package.json and yarn.lock to the working directory
COPY package.json yarn.lock ./

# Install project dependencies
RUN yarn install

COPY . .
RUN yarn codegen
RUN npx prisma generate
# Build the NestJS project
RUN yarn build

# Copy entrypoint script into the image
COPY entrypoint.sh /entrypoint.sh

# Make entrypoint script executable
RUN chmod +x /entrypoint.sh

# Set the entrypoint script as the entrypoint for this Docker image
ENTRYPOINT ["/entrypoint.sh"]
