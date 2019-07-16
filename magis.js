let fs = require("fs");
let parsed = JSON.parse(fs.readFileSync("data16072019.json", "UTF8"));
let newJSON = {users: {}, collectedData: {}, generatedPlaylists: {}}
let userKeys = Object.keys(parsed)

userKeys.map(key => {
    newJSON.users[key] = parsed[key].info;
    newJSON.collectedData[key] = parsed[key]["collected-data"];
    newJSON.generatedPlaylists[key] = parsed[key]["generated-playlists"];
})

// fs.writeFileSync("users.json", JSON.stringify(newJSON.users))
// fs.writeFileSync("collectedData.json", JSON.stringify(newJSON.collectedData))
// fs.writeFileSync("generatedPlaylists.json", JSON.stringify(newJSON.generatedPlaylists))

fs.writeFileSync("output2.json", JSON.stringify(newJSON))