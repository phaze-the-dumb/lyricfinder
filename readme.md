# Lyrics

It uses [THIS](https://github.com/phaze-the-dumb/fknmusicproto/) protocol to recive song metadata information.

Use these with a userscript plugin:
- [Spotify](https://github.com/phaze-the-dumb/fknmusicproto/blob/master/spotify-client.user.js?raw=true)
- [Jellyfin](https://github.com/phaze-the-dumb/fknmusicproto/blob/master/jellyfin-client.user.js?raw=true) - Note: You need to edit the address of this one to your jellyfin server ip

## Why?

no fucking idea.

## How?

Create a config.json file in the `src/` directory with the following:
```json
{
    "token": "GENIUS APP TOKEN"
}
```