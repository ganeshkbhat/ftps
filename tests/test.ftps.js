const assert = require('chai').assert;
const expect = require('chai').expect;
const sinon = require('sinon');


//
// Mocha/Chai/Sinon Tests
//
describe('FTPServer and FTPClient', () => {
    let ftpServer;
    let ftpClient;
    let serverPort = 5000;
    const serverAddress = '127.0.0.1';
  
    beforeEach(async () => {
      ftpServer = new FTPServer();
      await ftpServer.listen(serverPort, serverAddress);
      ftpClient = new FTPClient();
    });
  
    afterEach(async () => {
      await ftpServer.shutdown();
      if (ftpClient.socket) {
          ftpClient.disconnect();
      }
    });
  
    it('should establish a connection to the FTP server', async () => {
      const connectSpy = sinon.spy();
      ftpClient.on('connect', connectSpy);
      await ftpClient.connect(serverAddress, serverPort);
      expect(connectSpy).to.have.been.calledOnce;
      expect(ftpClient.socket).to.be.an('object');
    });
  
    it('should receive the welcome message from the server', async () => {
      await ftpClient.connect(serverAddress, serverPort);
      const receiveSpy = sinon.spy();
      ftpClient.on('receiveMessage', receiveSpy);
      await new Promise(resolve => setTimeout(resolve, 50)); //give time for data.
      expect(receiveSpy).to.have.been.calledWith(ftpClient.socket, '220 Welcome to the Simple FTP server.');
    });
  
    it('should handle USER and PASS commands', async () => {
      await ftpClient.connect(serverAddress, serverPort);
      const receiveSpy = sinon.spy();
      ftpClient.on('receiveMessage', receiveSpy);
  
      await ftpClient.send('USER test');
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(receiveSpy).to.have.been.calledWith(ftpClient.socket, '331 Password required');
  
      await ftpClient.send('PASS test');
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(receiveSpy).to.have.been.calledWith(ftpClient.socket, '230 Login successful.');
    });
  
    it('should handle the PWD command', async () => {
      await ftpClient.connect(serverAddress, serverPort);
      const receiveSpy = sinon.spy();
      ftpClient.on('receiveMessage', receiveSpy);
      await ftpClient.send('USER test');
      await new Promise(resolve => setTimeout(resolve, 50));
      await ftpClient.send('PASS test');
       await new Promise(resolve => setTimeout(resolve, 50));
      await ftpClient.send('PWD');
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(receiveSpy).to.have.been.calledWith(ftpClient.socket, '257 "/" is current directory.');
    });
  
    it('should handle the QUIT command', async () => {
      await ftpClient.connect(serverAddress, serverPort);
      const disconnectSpy = sinon.spy();
      ftpClient.on('disconnect', disconnectSpy);
      await ftpClient.send('QUIT');
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(disconnectSpy).to.have.been.calledOnce;
      expect(ftpClient.socket).to.be.null;
    });
  
    it('should emit an error on the server side for an invalid command', async () => {
      await ftpClient.connect(serverAddress, serverPort);
      const errorSpy = sinon.spy();
      ftpServer.on('error', errorSpy);
      await ftpClient.send('INVALID_COMMAND');
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(errorSpy).to.have.been.calledWith(sinon.match.instanceOf(Error), 'commandError', ftpClient.socket, 'INVALID_COMMAND');
    });
  });
  
  
  