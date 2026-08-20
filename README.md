# EdgeShare

EdgeShare is a fast, local file-sharing web application that allows you to seamlessly share files and text across devices on the same local network. Built with Node.js, Express, and Socket.IO, it features real-time updates and effortless mobile connection via QR codes.

## Features

- 🚀 **Local File Sharing**: Transfer files quickly without routing them over the public internet.
- 📱 **QR Code Connection**: Simply scan the QR code to connect your mobile device instantly.
- ⚡ **Real-Time Updates**: Powered by WebSockets (Socket.IO) for a seamless, live experience.
- 🐳 **Docker Support**: Easily run the application in an isolated container.
- 🧹 **Auto-Cleanup**: Automatically cleans up temporary files on server startup.

## Prerequisites

- [Node.js](https://nodejs.org/) (v20+ recommended)
- OR [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/)

## Installation

### Method 1: Using Node.js (Native)

1. Clone the repository or download the project files.
2. Navigate to the project directory:
   ```bash
   cd Edgeshare
   ```
3. Install the dependencies:
   ```bash
   npm install
   ```
4. Start the server:
   ```bash
   npm start
   # Or run directly with: node server.js
   ```

### Method 2: Using Docker

1. Ensure Docker is running.
2. In the project directory, use Docker Compose to build and start the service:
   ```bash
   docker-compose up -d
   ```
   *Alternatively, you can build and run the Docker image manually:*
   ```bash
   docker build -t edgeshare .
   docker run -p 9999:9999 edgeshare
   ```

## Usage

1. Once the server is running, it will output the local network IP address and port (e.g., `http://192.168.1.100:9999`).
2. Open this address in a web browser on any device connected to the same network.
3. For mobile devices, you can scan the QR code displayed on the screen to instantly open the application.
4. Start sharing text or files seamlessly!

## Built With

- **Backend**: Node.js, Express
- **Real-Time Communication**: Socket.IO
- **File Handling**: Multer
- **Containerization**: Docker
