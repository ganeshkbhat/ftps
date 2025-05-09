const assert = require('chai').assert;
const expect = require('chai').expect;
const sinon = require('sinon');


//
// Mocha/Chai/Sinon Tests
//
describe('SFTPServer and SFTPClient', () => {
    let sftpServer;
    let sftpClient;
    let serverPort = 6000;
    const serverAddress = '127.0.0.1';

    beforeEach(async () => {
        sftpServer = new SFTPServer();
        await sftpServer.listen(serverPort, serverAddress);
        sftpClient = new SFTPClient();
    });

    afterEach(async () => {
        await sftpServer.shutdown();
        if (sftpClient.socket) {
            await sftpClient.disconnect();
        }
    });

    it('should establish a connection to the SFTP server', async () => {
        const connectSpy = sinon.spy();
        sftpClient.on('connect', connectSpy);
        await sftpClient.connect(serverAddress, serverPort);
        expect(connectSpy).to.have.been.calledOnce;
        expect(sftpClient.socket).to.be.an('object');
    });

    it('should receive the server banner and SFTP ready message', async () => {
        await sftpClient.connect(serverAddress, serverPort);
        const receiveSpy = sinon.spy();
        sftpClient.on('receiveMessage', receiveSpy);
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(receiveSpy.getCall(0)).to.have.been.calledWith(sftpClient.socket, 'SSH-2.0-Simple-SFTP-Server');
        expect(receiveSpy.getCall(1)).to.have.been.calledWith(sftpClient.socket, 'SFTP-Server-Ready');
    });

    it('should handle INIT and AUTH commands', async () => {
        await sftpClient.connect(serverAddress, serverPort);
        const receiveSpy = sinon.spy();
        sftpClient.on('receiveMessage', receiveSpy);

        await sftpClient.send('INIT 3');
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(receiveSpy).to.have.been.calledWith(sftpClient.socket, 'SFTP-OK');

        await sftpClient.send('AUTH user pass');
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(receiveSpy).to.have.been.calledWith(sftpClient.socket, '230 Authentication successful.');
    });

    it('should handle the PWD command', async () => {
        await sftpClient.connect(serverAddress, serverPort);
        const receiveSpy = sinon.spy();
        sftpClient.on('receiveMessage', receiveSpy);
        await sftpClient.send('INIT 3');
        await new Promise(resolve => setTimeout(resolve, 50));
        await sftpClient.send('AUTH user pass');
        await new Promise(resolve => setTimeout(resolve, 50));
        await sftpClient.send('PWD');
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(receiveSpy).to.have.been.calledWith(sftpClient.socket, '257 /');
    });

    it('should handle the LIST command', async () => {
        await sftpClient.connect(serverAddress, serverPort);
        const receiveSpy = sinon.spy();
        sftpClient.on('receiveMessage', receiveSpy);
        await sftpClient.send('INIT 3');
        await new Promise(resolve => setTimeout(resolve, 50));
        await sftpClient.send('AUTH user pass');
        await new Promise(resolve => setTimeout(resolve, 50));
        await sftpClient.send('LIST');
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(receiveSpy.getCall(2)).to.have.been.calledWith(sftpClient.socket, 'drwxr-xr-x 2 user group 4096 Jan 1 00:00 .');
        expect(receiveSpy.getCall(3)).to.have.been.calledWith(sftpClient.socket, 'drwxr-xr-x 3 user group 4096 Jan 1 00:00 ..');
        expect(receiveSpy.getCall(4)).to.have.been.calledWith(sftpClient.socket, '-rw-r--r-- 1 user group    1024 Jan 1 00:05 file1.txt');
        expect(receiveSpy.getCall(5)).to.have.been.calledWith(sftpClient.socket, '226 List done.');
    });

    it('should handle the QUIT command', async () => {
        await sftpClient.connect(serverAddress, serverPort);
        const disconnectSpy = sinon.spy();
        sftpClient.on('disconnect', disconnectSpy);
         await sftpClient.send('INIT 3');
        await new Promise(resolve => setTimeout(resolve, 50));
        await sftpClient.send('AUTH user pass');
        await new Promise(resolve => setTimeout(resolve, 50));
        await sftpClient.send('QUIT');
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(disconnectSpy).to.have.been.calledOnce;
        expect(sftpClient.socket).to.be.null;
    });

    it('should emit an error on the server side for an invalid command', async () => {
        await sftpClient.connect(serverAddress, serverPort);
        const errorSpy = sinon.spy();
        sftpServer.on('error', errorSpy);
        await sftpClient.send('INVALID_COMMAND');
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(errorSpy).to.have.been.calledWith(sinon.match.instanceOf(Error), 'commandError', sftpClient.socket, 'INVALID_COMMAND');
    });

    it('should require authentication for PWD and LIST commands', async () => {
        await sftpClient.connect(serverAddress, serverPort);
        const receiveSpy = sinon.spy();
        sftpClient.on('receiveMessage', receiveSpy);

        await sftpClient.send('PWD');
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(receiveSpy).to.have.been.calledWith(sftpClient.socket, '530 Authentication required.');

        await sftpClient.send('LIST');
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(receiveSpy.getCall(1)).to.have.been.calledWith(sftpClient.socket, '530 Authentication required.');
    });
});