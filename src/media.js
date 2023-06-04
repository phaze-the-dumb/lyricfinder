const ws = require('ws');
const crypto = require('crypto');
const events = require('events');

class Activity{ constructor(){} };

class MusicMetaServer extends events.EventEmitter{
    constructor(opts = { debug: false }){
        super();

        this.server = null;
        this.client = null;
        this.mode = 0; // 0 - Cannot connect, 1 - This is host server, 2 - This is secondary server.
        this.started = false;
        this.opts = opts;
        this.id = crypto.randomUUID(); // Can be any string of random data, just needs to be able to regenerate if another server has the same id.
        this.secondarys = [] // Will be set to null if this is a secondary server.
        this.activity = [];
 
        this.startServer();
    }
    startServer(){
        this.server = new ws.Server({ port: 40309 });
    
        this.server.on('error', ( err ) => {
            if(err.code === 'EADDRINUSE'){
                this.server = null;
                this.client = new ws('ws://127.0.0.1:40309');

                this.client.on('error', ( err ) => {
                    this.mode = 0;
                    this.client = null;
                });

                this.client.on('open', () => {
                    if(this.opts.debug)
                        console.log('[MusicMetaServer] Attempting to run as secondary server');

                    this.openSecondary();
                });

                this.client.on('close', () => {
                    if(this.opts.debug)
                        console.log('[MusicMetaServer] Primary server closed, switching to primary server');
                    
                    this.client.close();
                    this.startServer();
                })
            } else
                throw new Error(err);
        })

        this.server.on('listening', () => {
            this.mode = 1;
            this.started = true;

            this.emit('Started', this.mode);
            this.openPrimary();

            if(this.opts.debug)
                console.log('[MusicMetaServer] Running as primary server');
        });
    }
    openSecondary(){
        this.client.on('message', ( data ) => {
            try{
                let msg = JSON.parse(data);

                if(msg.type === 'ClientUpdate'){
                    let activity = this.activity.find(x => x.id === msg.activity.id);
                    if(!activity){
                        activity = new Activity();

                        activity.socket = null;
                        activity.id = msg.activity.id;

                        this.activity.push(activity);
                    }

                    activity.media = msg.activity.media;
                    this.emit('ActivityUpdated', activity);

                    if(this.opts.debug)
                        console.log('[MusicMetaServer] Client Updated Activity');
                }

                if(msg.type === 'ClientDisconnect'){
                    if(this.opts.debug)
                        console.log('[MusicMetaServer] Client disconnected');

                    this.activity = this.activity.filter(x => x.id !== msg.id);
                }

                if(msg.type === 'ServerWelcome'){
                    // We've been accepted! We can continue running as normal from now.

                    this.mode = 2;
                    this.started = true;
                    this.secondaryserver = null;
                    this.emit('Started', this.mode);

                    if(this.opts.debug)
                        console.log('[MusicMetaServer] Running as secondary server');

                    return;
                }

                if(msg.type === 'ServerDenied'){
                    if(msg.reason === 'DuplicateID'){
                        // We've been denied because the primary server already has another listener under the same ID.
                        // This is rare but might still happen, so we need to regenerate another ID, then sent the "Server Hello" packet again.

                        this.id = crypto.randomUUID();
                        this.openSecondary();

                        return;
                    } else{
                        // The primary server has denied us. This should never happen, unless it's an invaild / incomplete secondary server.
                        this.emit('StartFailed', 'PrimaryDenied');

                        if(this.opts.debug)
                            console.log('[MusicMetaServer] Server has denied us. We cannot start.');
                    }
                }
            } catch(e){
                if(this.opts.debug)
                    console.log('[MusicMetaServer] Failed to start, Invaild response from primary', e);
            }
        })

        this.client.send(JSON.stringify({
            type: 'ServerHello', // Send "Server Hello" packet to introduce the secondary server to the primary.
            id: this.id,
        }))
    }
    openPrimary(){
        this.server.on('connection', ( socket ) => {
            socket.on('message', ( data ) => {
                try{
                    let msg = JSON.parse(data);
    
                    if(msg.type === 'ServerHello'){
                        if(this.secondarys.find(x => x.id === msg.id)){
                            socket.send(JSON.stringify({
                                type: 'ServerDenied', // Send "Server Denied" packet to tell the client to change id
                                reason: 'DuplicateID'
                            }));

                            this.activity.forEach(a => socket.send(JSON.stringify({
                                type: 'ClientUpdate',
                                songTitle: a.media.songTitle,
                                songArtist: a.media.songArtist,
                                songAlbum: a.media.songAlbum,
                                duration: a.media.duration,
                                elapsed: a.media.elapsed,
                                playing: a.media.playing,
                                source: a.media.source
                            })));
    
                            return;
                        }

                        if(this.opts.debug)
                            console.log('[MusicMetaServer] Secondary server connected: '+msg.id);
    
                        this.secondarys.push({ socket, id: msg.id });
                        socket.send(JSON.stringify({ type: 'ServerWelcome' }));

                        return;
                    }

                    if(msg.type === 'ClientUpdate'){
                        let activity = this.activity.find(x => x.socket === socket);
                        if(!activity){
                            activity = new Activity();

                            activity.socket = socket;
                            activity.id = crypto.randomUUID();
                            activity.media = {};

                            this.activity.push(activity);
                        }

                        activity.media.title = msg.songTitle;
                        activity.media.artist = msg.songArtist;
                        activity.media.album = msg.songAlbum;
                        activity.media.duration = msg.duration;
                        activity.media.elapsed = msg.elapsed;
                        activity.media.playing = msg.playing;
                        activity.media.source = msg.source;
                        this.emit('ActivityUpdated', activity);

                        this.secondarys.forEach(s =>
                            s.socket.send(JSON.stringify({ activity, type: 'ClientUpdate' })));

                        if(this.opts.debug)
                            console.log('[MusicMetaServer] Client Updated Activity');
                    }
                } catch(e){
                    if(this.opts.debug)
                        console.log('[MusicMetaServer] Invaild data from secondary / client', e);
                }
            });

            socket.on('close', () => {
                if(this.secondarys.find(x => x.socket === socket)){
                    if(this.opts.debug)
                        console.log('[MusicMetaServer] Secondary server disconnected');

                    this.secondarys = this.secondarys.filter(x => x.socket !== socket);
                    return;
                }

                if(this.activity.find(x => x.socket === socket)){
                    if(this.opts.debug)
                        console.log('[MusicMetaServer] Client disconnected');

                    let id = this.activity.find(x => x.socket === socket).id;
                    this.activity = this.activity.filter(x => x.socket !== socket);

                    this.secondarys.forEach(s =>
                        s.socket.send(JSON.stringify({ type: 'ClientDisconnect', id: id })));

                    return;
                }
            });
        });
    }
}

module.exports = MusicMetaServer;