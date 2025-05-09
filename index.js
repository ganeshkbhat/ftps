const net = require('net');
const { ProtocolServer } = require('./protocol-server'); // Adjust path
const { ProtocolClient } = require('./protocol-client');  // Adjust path


// Mock SFTP Client and Server (for demonstration purposes)
// In a real SFTP implementation, you would use a library
// like 'ssh2' to handle the SSH protocol and SFTP
// subsystem negotiation.  This is a *very* simplified
// simulation.

// Simplified SFTP Server
function SFTPServer() {
  ProtocolServer.call(this, 'SFTP');
  this.server = null;
  this.connections = {};
  this.nextSocketId = 0;
}

SFTPServer.prototype = Object.create(ProtocolServer.prototype);
SFTPServer.prototype.constructor = SFTPServer;

SFTPServer.prototype.listen = async function (port, address = '0.0.0.0') {
    await ProtocolServer.prototype.listen.call(this, port, address);
    const self = this;
    return new Promise((resolve, reject) => {
        self.server = net.createServer((socket) => {
            const socketId = self.nextSocketId++;
            self.connections[socketId] = { socket, authenticated: false, cwd: '/' };
            socket.socketId = socketId;
            self.handleConnection(socket);
        });

        self.server.on('listening', () => {
            console.log(`SFTP server listening on ${address}:${port}`);
            resolve();
        });

        self.server.on('error', (err) => {
            console.error('SFTP server error:', err);
            self.call('error', err, 'listen');
            reject(err);
        });

        self.server.listen(port, address);
    });
};

SFTPServer.prototype.handleConnection = async function (socket) {
    const self = this;
    await ProtocolServer.prototype.handleConnection.call(this, socket);

    socket.write('SSH-2.0-Simple-SFTP-Server\r\n'); // Simulate SSH banner
    socket.write('SFTP-Server-Ready\r\n');       //Simulate SFTP ready

    socket.on('data', async (data) => {
        const strData = data.toString().trim();
        const parts = strData.split(' ');
        const command = parts[0].toUpperCase();
        const args = parts.slice(1).join(' ');

        console.log(`SFTP Command Received: ${command} ${args}`);
        try {
            await self.call('receiveMessage', socket, strData);

            if (!self.connections[socket.socketId].authenticated && command !== 'AUTH' && command !== 'INIT') {
                socket.write('530 Authentication required.\r\n');
                self.call('error', new Error('Authentication required'), 'receiveMessage', socket, strData);
                return;
            }
            switch (command) {
                case 'INIT':  // Simulate SSH and SFTP init
                    self.handleInit(socket, args);
                    break;
                case 'AUTH': // Simulate Authentication
                    self.handleAuth(socket, args);
                    break;
                case 'PWD':
                    self.handlePwd(socket);
                    break;
                 case 'LIST':
                    self.handleList(socket);
                    break;
                case 'QUIT':
                    self.handleQuit(socket);
                    break;
                default:
                    socket.write('502 Command not implemented.\r\n');
                    self.call('error', new Error(`Command not implemented: ${command}`), 'receiveMessage', socket, strData);
            }
        } catch (error) {
            self.call('error', error, 'commandError', socket, strData);
        }
    });

    socket.on('end', () => {
        self.disconnect(socket);
    });
};

SFTPServer.prototype.handleInit = function(socket, args){
    const self = this;
     self.call('processMessage', socket, `INIT ${args}`);
    socket.write('SFTP-OK\r\n');
}

SFTPServer.prototype.handleAuth = function (socket, args) {
    const self = this;
    self.call('processMessage', socket, `AUTH ${args}`);
    if (args === 'user pass') { // Very insecure, for demonstration only
        self.connections[socket.socketId].authenticated = true;
        socket.write('230 Authentication successful.\r\n');
    } else {
        socket.write('530 Authentication failed.\r\n');
        self.call('error', new Error('Authentication failed'), 'processMessage', socket, `AUTH ${args}`);
    }
};

SFTPServer.prototype.handlePwd = async function (socket) {
    const self = this;
    await self.call('processMessage', socket, 'PWD');
    socket.write(`257 ${self.connections[socket.socketId].cwd}\r\n`);
};

SFTPServer.prototype.handleList = async function(socket){
    const self = this;
    await self.call('processMessage', socket, 'LIST');
    socket.write("drwxr-xr-x 2 user group 4096 Jan 1 00:00 .\r\n");
    socket.write("drwxr-xr-x 3 user group 4096 Jan 1 00:00 ..\r\n");
    socket.write("-rw-r--r-- 1 user group    1024 Jan 1 00:05 file1.txt\r\n");
    socket.write("226 List done.\r\n");
}

SFTPServer.prototype.handleQuit = async function (socket) {
    const self = this;
    await self.call('processMessage', socket, 'QUIT');
    socket.write('221 Goodbye.\r\n');
    self.disconnect(socket);
};

SFTPServer.prototype.disconnect = async function (socket) {
    const self = this;
    await ProtocolServer.prototype.disconnect.call(this, socket);
    const socketId = socket.socketId;
    if (socketId !== undefined) {
        delete self.connections[socketId];
    }
};

SFTPServer.prototype.shutdown = async function () {
    await ProtocolServer.prototype.shutdown.call(this);
    const self = this;
    return new Promise((resolve) => {
        if (self.server) {
            self.server.close(() => {
                console.log('SFTP server closed.');
                resolve();
            });
        } else {
            resolve();
        }
    });
};

// Simplified SFTP Client
function SFTPClient() {
    ProtocolClient.call(this, 'SFTP');
    this.socket = null;
    this.responseBuffer = '';
    this.authenticated = false;
}

SFTPClient.prototype = Object.create(ProtocolClient.prototype);
SFTPClient.prototype.constructor = SFTPClient;

SFTPClient.prototype._connectToServer = async function (serverAddress, serverPort) {
    const self = this;
    return new Promise((resolve, reject) => {
        self.socket = net.connect(serverPort, serverAddress, () => {
            resolve(self.socket);
        });

        self.socket.on('error', (err) => {
            reject(err);
        });
    });
};

SFTPClient.prototype._setupConnectionListeners = function (connection) {
    const self = this;
    connection.on('data', (data) => {
        self.responseBuffer += data.toString();
        const delimiter = /\r\n|\n/;
        let lines = self.responseBuffer.split(delimiter);
        while (lines.length > 0) {
            const line = lines.shift();
            if (line) {
                self.call('receiveMessage', connection, line);
            }
        }
    });

    connection.on('end', () => {
        self.disconnect();
    });

    connection.on('error', (err) => {
        self.call('error', err, 'connectionError', connection);
        self.disconnect();
    });
};

SFTPClient.prototype.send = async function (command) {
    const self = this;
    console.log(`SFTP client sending: ${command}`);
    try {
        await self.call('sendMessage', self.socket, command);
        self.socket.write(command + '\r\n');
    } catch (error) {
        self.call('error', error, 'sendMessage', self.socket, command);
        throw error;
    }
};

SFTPClient.prototype.disconnect = async function () {
    const self = this;
    await ProtocolClient.prototype.disconnect.call(this);
    if (self.socket) {
        self.socket.end();
        self.socket.destroy();
        self.socket = null;
    }
};


module.exports = { SFTPClient, SFTPServer };


const net = require('net');
const { ProtocolServer } = require('./protocol-server'); // Adjust the path if needed
const { ProtocolClient } = require('./protocol-client');  // Adjust the path if needed
const assert = require('chai').assert;
const expect = require('chai').expect;
const sinon = require('sinon');

// FTP Server (Function Implementation)
function FTPServer() {
  ProtocolServer.call(this, 'FTP');
  this.server = null;
  this.connections = {}; // Store client connections by socket
  this.nextSocketId = 0;
}

// Inherit prototype methods from ProtocolServer
FTPServer.prototype = Object.create(ProtocolServer.prototype);
FTPServer.prototype.constructor = FTPServer;

FTPServer.prototype.listen = async function(port, address = '0.0.0.0') {
  await ProtocolServer.prototype.listen.call(this, port, address);
  const self = this;
  return new Promise((resolve, reject) => {
    self.server = net.createServer((socket) => {
      const socketId = self.nextSocketId++;
      self.connections[socketId] = { socket, user: null, cwd: '/' }; // Store socket info
      socket.socketId = socketId; // Attach the id to the socket
      self.handleConnection(socket);
    });

    self.server.on('listening', () => {
      console.log(`FTP server listening on ${address}:${port}`);
      resolve();
    });

    self.server.on('error', (err) => {
      console.error('FTP server error:', err);
      self.call('error', err, 'listen');
      reject(err);
    });

    self.server.listen(port, address);
  });
};

FTPServer.prototype.handleConnection = async function(socket) {
  const self = this;
  await ProtocolServer.prototype.handleConnection.call(this, socket); // Call parent
  socket.write('220 Welcome to the Simple FTP server.\r\n'); // Send initial greeting

    socket.on('data', async (data) => {
        const strData = data.toString().trim();
        const command = strData.split(' ')[0].toUpperCase();
        const args = strData.split(' ').slice(1).join(' ');
        console.log(`FTP Command Received: ${command} ${args}`);

        try {
            await self.call('receiveMessage', socket, strData);  // Emit the raw command

            // Basic FTP command handling (illustrative)
            switch (command) {
                case 'USER':
                    await self.handleUser(socket, args);
                    break;
                case 'PASS':
                    await self.handlePass(socket, args);
                    break;
                case 'PWD':
                    await self.handlePwd(socket);
                    break;
                case 'QUIT':
                    await self.handleQuit(socket);
                    break;
                default:
                    socket.write('502 Command not implemented.\r\n');
                    self.call('error', new Error(`Command not implemented: ${command}`), 'receiveMessage', socket, strData);
            }
        } catch (error) {
             self.call('error', error, 'commandError', socket, strData);
        }
    });

    socket.on('end', () => {
      self.disconnect(socket);
    });
};

FTPServer.prototype.handleUser = async function(socket, username) {
    const self = this;
    await self.call('processMessage', socket, `USER ${username}`);
    if (username === 'test') { //hardcoded
        self.connections[socket.socketId].user = username;
        socket.write('331 Password required\r\n');
    } else {
        socket.write('530 Invalid username.\r\n');
        self.call('error', new Error('Invalid username'), 'processMessage', socket, `USER ${username}`);
    }
}

FTPServer.prototype.handlePass = async function(socket, password) {
    const self = this;
     await self.call('processMessage', socket, `PASS ${password}`);
    if (self.connections[socket.socketId].user && password === 'test') { //hardcoded
        socket.write('230 Login successful.\r\n');
    } else {
        socket.write('530 Invalid password.\r\n');
        self.call('error', new Error('Invalid password'), 'processMessage', socket, `PASS ${password}`);
    }
}

FTPServer.prototype.handlePwd = async function(socket) {
    const self = this;
    await self.call('processMessage', socket, 'PWD');
    socket.write(`257 "${self.connections[socket.socketId].cwd}" is current directory.\r\n`);
}

FTPServer.prototype.handleQuit = async function(socket) {
    const self = this;
    await self.call('processMessage', socket, 'QUIT');
    socket.write('221 Goodbye.\r\n');
    self.disconnect(socket);
}

FTPServer.prototype.disconnect = async function(socket) {
  const self = this;
  await ProtocolServer.prototype.disconnect.call(this, socket);
  const socketId = socket.socketId; // Get the socket ID
  if (socketId !== undefined) {
    delete self.connections[socketId]; // Remove from storage
  }
};

FTPServer.prototype.shutdown = async function() {
  await ProtocolServer.prototype.shutdown.call(this);
  const self = this;
  return new Promise((resolve) => {
    if (self.server) {
      self.server.close(() => {
        console.log('FTP server closed.');
        resolve();
      });
    } else {
      resolve();
    }
  });
};

// FTP Client (Function Implementation)
function FTPClient() {
  ProtocolClient.call(this, 'FTP');
  this.socket = null;
  this.responseBuffer = '';
}

// Inherit prototype methods from ProtocolClient
FTPClient.prototype = Object.create(ProtocolClient.prototype);
FTPClient.prototype.constructor = FTPClient;

FTPClient.prototype._connectToServer = async function(serverAddress, serverPort) {
  const self = this;
  return new Promise((resolve, reject) => {
    self.socket = net.connect(serverPort, serverAddress, () => {
      resolve(self.socket);
    });

    self.socket.on('error', (err) => {
      reject(err);
    });
  });
};

FTPClient.prototype._setupConnectionListeners = function(connection) {
  const self = this;
  connection.on('data', (data) => {
    self.responseBuffer += data.toString();
    //basic response handling.
    const delimiter = /\r\n|\n/;
    let lines = self.responseBuffer.split(delimiter);
    while (lines.length > 1) {
        const line = lines.shift();
        self.responseBuffer = lines.join(delimiter);
        self.call('receiveMessage', connection, line);
    }
  });

  connection.on('end', () => {
    self.disconnect();
  });

  connection.on('error', (err) => {
    self.call('error', err, 'connectionError', connection);
    self.disconnect();
  });
};

FTPClient.prototype.send = async function(command) {
  const self = this;
  console.log(`FTP client sending: ${command}`);
  try {
    await self.call('sendMessage', self.socket, command);
    self.socket.write(command + '\r\n');
  } catch (error) {
    self.call('error', error, 'sendMessage', self.socket, command);
    throw error;
  }
};

FTPClient.prototype.disconnect = async function() {
  const self = this;
  await ProtocolClient.prototype.disconnect.call(this);
  if (self.socket) {
    self.socket.end();
    self.socket.destroy();
    self.socket = null;
  }
};
