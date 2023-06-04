const MusicMetaServer = require('./media');
const { app, BrowserWindow } = require('electron');
const fetch = require('node-fetch');
const config = require('./config.json');
const cheerio = require('cheerio');
const ws = require('ws');

if(require('electron-squirrel-startup'))app.quit();

let meta = new MusicMetaServer({ debug: true });
let songName = '';
let songData = null;
let singleData = null;
let lyrics = '';
let server = new ws.Server({ port: 40310 });
let sock = null;
let currentActivity = null;

server.on('connection', s => {
    sock = s;

    if(lyrics && singleData)
        sock.send(JSON.stringify({ type: 'lyrics', lyrics, song: singleData }));
});

server.on('error', () => app.quit());

let showLyrics = () => {
    if(sock)
        sock.send(JSON.stringify({ type: 'lyrics', lyrics, song: singleData }));
}

meta.on('ActivityUpdated', a => {
    if(
        songName !== a.media.artist + ' - ' + a.media.title && a.media.title && a.media.artist && 
        songName !== a.media.artist.split('(')[0].split('[')[0].trim() + ' - ' + a.media.title.split('(')[0].split('[')[0].trim()
    ){
        songName = a.media.artist + ' - ' + a.media.title;
        console.log('New Song: '+songName);

        lyrics = null;
        singleData = null;

        if(sock)
            sock.send(JSON.stringify({ type: 'newsong' }));

        currentActivity = a;
        findSong(0);
    }

    if(sock)
        sock.send(JSON.stringify({ type: 'progress', time: a.media.elapsed / a.media.duration }));
})

let findSong = ( attempt ) => {
    console.log('Fetching Data Attempt: '+attempt);
    fetch('https://api.genius.com/search?q='+songName, { headers: { Authorization: 'Bearer '+config.token }})
            .then(data => data.json()).then(data => {
                songData = data;
                let song = songData.response.hits.find(x => (
                    x.result.title_with_featured.toLowerCase() == currentActivity.media.title.toLowerCase() || 
                    x.result.title.toLowerCase()               == currentActivity.media.title.toLowerCase()
                ) && x.type === 'song');

                if(!song)song = songData.response.hits.find(x => (
                    x.result.title_with_featured.toLowerCase() == currentActivity.media.title.split('(')[0].split('[')[0].trim().toLowerCase() || 
                    x.result.title.toLowerCase()               == currentActivity.media.title.split('(')[0].split('[')[0].trim().toLowerCase()
                ) && x.type === 'song');

                if(!song && attempt === 0){
                    songName = currentActivity.media.artist.split('(')[0].split('[')[0].trim() + ' - ' + currentActivity.media.title.split('(')[0].split('[')[0].trim();
                    console.log('Testing Different Name: '+songName);
                    findSong(1);
                }

                if(!song && attempt === 1){
                    if(sock)
                        sock.send(JSON.stringify({ type: 'cannotfind' }));
                }

                if(!song)return;
                singleData = song;

                console.log('Loading Lyrics...');
                fetch(song.result.url).then(data => data.text()).then(data => {
                    let $ = cheerio.load(data);

                    lyrics = $('div[class="lyrics"]').text().trim();

                    if(!lyrics){
                        lyrics = '';
                        $('div[class^="Lyrics__Container"]').each((i, elem) => {
                            if ($(elem).text().length !== 0) {
                                let snippet = $(elem)
                                    .html()
                                    .replace(/<br>/g, '\n')
                                    .replace(/<(?!\s*br\s*\/?)[^>]+>/gi, '');

                                lyrics += $('<textarea/>').html(snippet).text().trim() + '\n\n';
                            }
                        });
                    }

                    showLyrics();
                    console.log('Got Lyrics.');
                })
            });
}

app.on('ready', () => {
    let win = new BrowserWindow({
        width: 1920,
        height: 1080,
        transparent: true,
        frame: false
    })

    win.loadFile(__dirname + '/index.html');
})