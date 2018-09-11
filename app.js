if(!process.env.HEROKU){require('dotenv').config()}
const express = require('express')
const fileUpload = require('express-fileupload')
const fs = require("fs")
const path = require("path")
const request = require("request")
const sharp = require("sharp")
let moment = require("moment")
var firebase = require("firebase")
var morgan = require('morgan')
var SpotifyWebApi = require("spotify-web-api-node")

const app = express();

app.use(morgan('dev'));
app.use(fileUpload());
app.use('/static', express.static(path.join(__dirname, 'public')))

var config = {
    apiKey: process.env.FIREBASE_API,
    authDomain: "spotify-utils.firebaseapp.com",
    databaseURL: "https://spotify-utils.firebaseio.com",
    projectId: "spotify-utils",
    storageBucket: "spotify-utils.appspot.com",
    messagingSenderId: "505597005023"
  };
firebase.initializeApp(config);

let db = firebase.database();

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

app.get("/gotcode", async (req, res) => {
    await spotifyApi.authorizationCodeGrant(req.query.code).then(d => {
        token = d.body['access_token'];
        spotifyApi.setAccessToken(d.body['access_token']);
        spotifyApi.setRefreshToken(d.body['refresh_token']);
    }, err => console.log(err));
    spotifyApi.getMe().then(x => {
        me = x.body.id;
        console.log(x.body);
        db.ref("users/" + me + "/info").set(x.body, y => console.log(y))
    },err => res.send(Object.assign(err,{source:"/gotcode getMe"})));
    if(req.query.state === "c50") {
        res.redirect("/your_playlist_will_be_ready_very_soon")
    }
    else {
        res.send(`<p>You have logged in with: ${req.query.code}</p><a href="/utilities">Utilities</a>`);
    }
});

app.get("/utilities", (req,res) => {
    res.render("utilities");
})

app.get("/utilities/me", (req,res) => {
    spotifyApi.getMe().then(data => res.send(data.body), err => res.send(err));
});

app.get("/utilities/playlistchosen", (req,res) => {
    let playlistId = req.query.id;
    spotifyApi.getPlaylist(me,playlistId).then((data) => {
        let playlistName = data.body.name;
        const orderedArray = data.body.tracks.items.map(x => x.track.id);
        var shuffledArray = orderedArray.shuffle();
        spotifyApi.createPlaylist(me, playlistName + " [SHUFFLED]", { 'public' : false }).then(newPlaylist => {
            const newListId = newPlaylist.body.id;
            const newListUrl = newPlaylist.body.external_urls.spotify;
            const tracksString = shuffledArray.map(x => "spotify:track:" + x);
            spotifyApi.addTracksToPlaylist(me,newListId,tracksString).then(tracksAdded => {
                res.send(`<a href="${newListUrl}">${playlistName} [SHUFFLED] on Spotify</a>`);
            }, onReject => console.log(onReject));
        }, onReject => console.log(onReject));
    }, onReject => console.log(onReject));
});

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

app.get("/utilities/topsongscombined", (req,res) => {
    let timeFrames = ["long_term", "medium_term", "short_term"];
    let optionsArray = timeFrames.map(time => {return {"limit": 50, "offset": 0, "time_range": time}});
    let name = "Kümülatif 50";
    let promiseArray = [];
    optionsArray.forEach(opt => {
        var apiReq = spotifyApi.getMyTopTracks(opt);
        promiseArray.push(apiReq);
    });
    Promise.all(promiseArray).then(data => {
        let itemsByLists = data.map(d => d.body.items.map((i,index) => {return {id: i.id, index: index}}));
        let combinedListWithScores = {};
        itemsByLists.forEach((list,listIndex) => list.forEach(item => {
            if(combinedListWithScores[item.id]) {
                combinedListWithScores[item.id].score += (50 - item.index) * (listIndex + 1)
                combinedListWithScores[item.id].existsIn.push(listIndex + 1);
            }
            else {
                combinedListWithScores[item.id] = {score: (50 - item.index) * (listIndex + 1), existsIn: [listIndex + 1], id: item.id};
            }
        }))
        let sortedArray = Object.keys(combinedListWithScores).map(idobj => combinedListWithScores[idobj]).sort((a,b) => b.score - a.score).slice(0,50);
        let sortedUris = sortedArray.map(i => "spotify:track:" + i.id);
        spotifyApi.createPlaylist(me, name, { 'public' : false , 'description' : 'ağırlıklı ortalama gibi düşünebilirsin bu listeyi'}).then((dataa) => {
            const newListId = dataa.body.id;
            const newListUrl = dataa.body["external_urls"]["spotify"];
            spotifyApi.addTracksToPlaylist(me,newListId,sortedUris).then(clg => {
                var cl = fs.createReadStream(path.join(__dirname + "/public/image/top.jpeg"), {encoding: "base64"}).pipe(
                    request.put(`https://api.spotify.com/v1/users/${me}/playlists/${newListId}/images`,{headers: {"Authorization": "Bearer " + token, "Content-Type": "image/jpeg"}}, (s,v) => {
                        res.render("coverpage", {name:name,url:newListUrl,img:"top"})
                    })
                );
            },err => console.log("130!",err));
        }, (err) => {
            console.log('132!', err);
            res.send(err)
        });
    }).catch(err => {
        console.log(err);
    })
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
                res.render("coverpage", {name:pif.name,url:pif.url,id:pid,img:"cover"})
            })
        );
    }).catch(err => console.error(err))
});

app.get("/c50", (req,res) => {
    var aURL = spotifyApi.createAuthorizeURL(scopes,"c50");
    res.redirect(aURL);
});

app.get("/your_playlist_will_be_ready_very_soon", (req,res) => {
    let name = "Kümülatif 50";
    let timeFrames = ["long_term", "medium_term", "short_term"];
    let optionsArray = timeFrames.map(time => {return {"limit": 50, "offset": 0, "time_range": time}});
    let promiseArray = optionsArray.map(opt => spotifyApi.getMyTopTracks(opt));
    let pureData;
    Promise.all(promiseArray).then(onFullfill => {
        pureData = onFullfill.map(y => y.body);
        let itemsByLists = onFullfill.map(d => d.body.items.map((i,index) => {return {id: i.id, index: index, name: i.name}}));
        let evaluatedTracks = [];

        itemsByLists.forEach((list,listIndex) => list.forEach((item,itemIndex) => {
            var trackInPlaylist = evaluatedTracks.find(x => x.id === item.id);
            if(trackInPlaylist) {
                trackInPlaylist.score += calcScore(item.index, listIndex);
                trackInPlaylist.existsIn.push(listIndex + 1);
            }
            else {
                var evaluatedTrack = Object.assign(item,{score: calcScore(item.index, listIndex), existsIn: [listIndex + 1]})
                evaluatedTracks.push(evaluatedTrack);
            }
            if((listIndex + 1 === itemsByLists.length) && (itemIndex + 1 === list.length)) {
                evaluatedTracks.map(track => {
                    track.score *= track.existsIn.reduce((a,v) => a + (v+1)) * 2;
                })
            }
        }));

        let playlistTracks = evaluatedTracks.sort((a,b) => b.score - a.score).slice(0,50)
        let playlistUris = playlistTracks.map(track => "spotify:track:" + track.id);
        let playlistDate = moment().format("DD.MM.YYYY").toString();
        let description = `Kümülatif 50'yi zaman ağırlıklı ortalama gibi düşünebilirsin. matematiksel olarak en çok açmak isteyebileceğin sıradalar. ` + playlistDate;
        spotifyApi.createPlaylist(me,name,{public: true, description: description}).then(newPlaylist => {
            spotifyApi.addTracksToPlaylist(me,newPlaylist.body.id,playlistUris).then(tracksAdded => {
                //console.log(playlistTracks);
                //Adding a cover image.
                fs.createReadStream(path.join(__dirname + "/public/image/top.jpeg"), {encoding: "base64"}).pipe(
                    request.put(`https://api.spotify.com/v1/users/${me}/playlists/${newPlaylist.body.id}/images`,{headers: {"Authorization": "Bearer " + token, "Content-Type": "image/jpeg"}}, () => {
                        db.ref("users/" + me + "/generated-playlists").push({tracks: playlistTracks, date: playlistDate, description: description, url: newPlaylist.body.external_urls.spotify});
                        pureData.Date = playlistDate;
                        db.ref("users/" + me + "/collected-data").push(pureData);
                        res.render("coverpage", {name:name,url:newPlaylist.body.external_urls.spotify,img:"top"});
                    })
                );
            }, onReject => {console.error(onReject)});
        }, onReject => {console.error(onReject)});
    }, onReject => {console.error(onReject)});
});


app.listen((process.env.PORT || 5000), () => console.log('App listening on port ' + (process.env.PORT || 5000)));

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

function calcScore(ti,li) {
    return (50-ti)*(3-li);
}