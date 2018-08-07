if(!process.env.HEROKU){require('dotenv').config()}
const express = require('express')
const fileUpload = require('express-fileupload')
const fs = require("fs")
const path = require("path")
const request = require("request")
const sharp = require("sharp")
var morgan = require('morgan')
var SpotifyWebApi = require("spotify-web-api-node")

const app = express();

app.use(morgan('dev'));
app.use(fileUpload());
app.use('/static', express.static(path.join(__dirname, 'public')))

var spotifyApi = new SpotifyWebApi({
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    redirectUri: (process.env.HEROKU)?"https://spotifyutils.herokuapp.com/gotcode":"http://localhost:5000/gotcode"
})

var scopes = ['user-read-private', 'user-read-email', 'user-library-read', 'playlist-modify-public', 'playlist-modify-private', 'ugc-image-upload', 'playlist-read-private', 'user-top-read'];

var authorizeURL = spotifyApi.createAuthorizeURL(scopes);

let me,token;

app.set('view engine', 'pug');

app.get('/', (req, res) => res.send("<a href=" + authorizeURL + ">Login to Spotify</a>"));

app.get("/gotcode", (req, res) => {
    spotifyApi.authorizationCodeGrant(req.query.code).then(d => {
        token = d.body['access_token'];
        spotifyApi.setAccessToken(d.body['access_token']);
        spotifyApi.setRefreshToken(d.body['refresh_token'])
    }, err => console.log(err));
    res.send(`<p>You have logged in with: ${req.query.code}</p><a href="/utilities">Utilities</a>`);
});

app.get("/utilities", (req,res) => {
    spotifyApi.getMe().then(x => me = x.body.id,err => res.send(err));
    res.render("utilities");
})

app.get("/utilities/me", (req,res) => {
    spotifyApi.getMe()
  .then(function(data) {
    console.log('Some information about the authenticated user', data.body);
    res.send(data.body)
  }, function(err) {
    console.log('34!', err);
    res.send(err)
  });
});

app.get("/utilities/playlistchosen", (req,res) => {
    let playlistId = req.query.id;
    let playlistName;
    var me;
    spotifyApi.getMe().then(x => me = x.body.id,err => res.send(err));
    spotifyApi.getPlaylist(me,playlistId).then((data) => {
        playlistName = data.body.name;
        const orderedArray = data.body.tracks.items.map(x => x.track.id);
        var shuffledArray = orderedArray.shuffle();
        spotifyApi.createPlaylist(me, playlistName + " [SHUFFLED]", { 'public' : false }).then((dataa) => {
            const newListId = dataa.body.id;
            const newListUrl = dataa.body["external_urls"]["spotify"];
            const tracksString = shuffledArray.map(x => "spotify:track:" + x);
            spotifyApi.addTracksToPlaylist(me,newListId,tracksString).then(clg => res.send(`<a href="${newListUrl}">${playlistName} [SHUFFLED] on Spotify</a>`),err => console.log("70!",err));
        }, (err) => {
            console.log('72!', err);
        });
  }, function(err) {
    console.log('75!', err);
  });
})

app.get("/utilities/topsongsparams", (req,res) => {
    res.render("topsongsparams");
});

app.get("/utilities/topsongs", (req,res) => {
    let options = {time_range: req.query.time_range, limit: parseInt(req.query.limit), offset: parseInt(req.query.offset)}
    let name = options.time_range + " " + options.offset + "-" + (options.offset+options.limit);
    var me;
    spotifyApi.getMe().then(x => me = x.body.id, err => res.send(err));
    spotifyApi.getMyTopTracks(options).then(data => {
        let tt = data.body.items.map(x => x.uri);
        spotifyApi.createPlaylist(me, name, { 'public' : false }).then((dataa) => {
            const newListId = dataa.body.id;
            const newListUrl = dataa.body["external_urls"]["spotify"];
            spotifyApi.addTracksToPlaylist(me,newListId,tt).then(clg => res.send(`<a href="${newListUrl}">${name} on Spotify</a>`),err => console.log("82!",err));
        }, (err) => {
            console.log('84!', err);
            res.send(err)
        });
    }, err => console.log("86!", err))
});

app.get("/utilities/allsongs", (req,res) => {
    spotifyApi.getMySavedTracks().then(saved => {
        let count = saved.body.total;
        let myLibrary = [];

        for(var i = 0; i < count; i = i + 50) {
            myLibrary.push(spotifyApi.getMySavedTracks({limit: 50, offset: i}))
        }

        Promise.all(myLibrary).then(ff => {
            let allItems = [].concat.apply([],ff.map(f => f.body.items));
            res.send(allItems.map(i => i.track.name));
        }, err => console.log(err));
    }, err => console.log(err));
});

app.get("/utilities/pickplaylist", (req,res) => {
    var target = req.query.target;
    spotifyApi.getUserPlaylists(me,{limit:50}).then((data) => {
        res.render("playlistslist", {playlists: data.body.items.map(y => {return {name: y.name, id: y.id, user: me, length: y.tracks.total}}), target: target});
    }, err => {
        console.log('121!', err);
    });
});

app.get("/utilities/allplaylistsongs", (req,res) => {
    let requestedId = req.query.id;
    spotifyApi.getPlaylistTracks(me,requestedId).then(alltracks => {
        let count = alltracks.body.total;
        let myLibrary = [];
        for(var i = 0; i < count; i = i + 50) {
            myLibrary.push(spotifyApi.getPlaylistTracks(me,requestedId,{limit: 50, offset: i}))
        }

        Promise.all(myLibrary).then(ff => {
            let allItems = [].concat.apply([],ff.map(f => f.body.items));
            res.send(allItems.map(i => i.track.name));
        }, err => console.log(err));
    }, err => console.log(err))
});

app.get("/utilities/uploadcover", (req,res) => {
    res.render("upload",{id: req.query.id});
});

app.post('/utilities/uploader', function(req, res) {
    let pid = req.query.id;
    let pif;
    spotifyApi.getPlaylist(me,pid).then(data => {pif = {name: data.body.name, url: data.body["external_urls"]["spotify"]}})
    if (!req.files) return res.status(400).send('No files were uploaded.');
    let sampleFile = req.files.bruh;
    var cover = sharp(sampleFile.data).resize(512,512).jpeg({quality: 90});
    var buffet = cover.toFile(path.join(__dirname + "/public/image/cover.jpeg")).then(buff => {
        var cl = fs.createReadStream(path.join(__dirname + "/public/image/cover.jpeg"), {encoding: "base64"}).pipe(
            request.put(`https://api.spotify.com/v1/users/${me}/playlists/${pid}/images`,{headers: {"Authorization": "Bearer " + token, "Content-Type": "image/jpeg"}}, (s,v) => {
                res.render("coverpage", {name:pif.name,url:pif.url,id:pid})
            })
        );
    })
    /* cover.toFile(__dirname + "/public/image/cover.jpeg").then(x => {
        fs.readdir("./public/image/", (err,files) => {
            if(err) console.error(err)
            if(files.find(z => z === "cover.jpeg")) {
                console.log(files);
                console.log();
                request("/static/image/cover.jpeg").pipe(request.put(`https://api.spotify.com/v1/users/${me}/playlists/${pid}/images`),{"Authorization": token, "Content-Type": "image/jpeg"}, (requested,response,error) => {console.log(requested,response,error);})
            }
                request.put(`https://api.spotify.com/v1/users/${me}/playlists/${pid}/images`),{"Authorization": "Basic " + token, "Content-Type": "image/jpeg"})
        })
    }).catch(err => console.error) */
});

app.listen((process.env.PORT || 5000), () => console.log('Example app listening on port ' + (process.env.PORT || 5000)));

Array.prototype.shuffle = function () {
    var len = this.length;
    var i = len;
    while (i--) {
        var p = parseInt(Math.random() * len);
        var t = this[i];
        this[i] = this[p];
        this[p] = t;
    }
    return this;
};