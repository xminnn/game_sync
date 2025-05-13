const express = require("express");
const expressWs = require("express-ws");
require("./log");

let app = express();
expressWs(app);
app.all("*", function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "*");
    res.header("Access-Control-Allow-Methods", "*");
    next();
});
app.use("/", express.static("./client", { lastModified: true }));

let outputQueue = [];
const hanlders = {
    frame(data, ws, player) {
        outputQueue.push({ data, ws, player });
    },
    heartbeat(data, ws) {
        data.svrtime = Date.now();
        ws.send(JSON.stringify({
            func: "heartbeat",
            data
        }));
    }
};
setInterval(() => {
    while (outputQueue.length) {
        let { data, ws, player } = outputQueue.shift();
        if (data.timestamp > Date.now()) {
            console.log("what?");
        }
        data.uid = player.data.uid;
        if (player.data.frames.length && player.data.frames[player.data.frames.length - 1].timestamp > data.timestamp) { // 这个是必须的，必须保证时间的顺序, 这里纠正时间
            data.timestamp = Date.now();
        }
        // if (Math.random() * 100 < 5) {// 概率受到插针
        //     console.log("rollback");
        //     data.timestamp = Date.now(); // 这里默认使用客户端的帧，记录上一次服务器插帧时间。如果插帧时间大于该时间，则该帧纠正时间戳为服务器接收时间。否则以客户端时间为准。这样可以有效降低客户端预测失败的概率
        // }
        for (const uid in allWs) {
            allWs[uid].send(JSON.stringify({
                func: "frame",
                data,
            }));
        }
        player.reciFrame(data);
    }
    // 服务器计算，确保数据的权威性。同时一些结算操作也是由服务器发起，例如死亡判定，地图碰撞校验等等。
    for (const uid in allPlayers) { // 推送其他玩家的数据
        let player = allPlayers[uid];
        player.onOnce(Date.now());
    }
    // TODO 定期同步数据的md5值，如果客户端发现不一致，直接全量重新同步一遍
}, 160);

const { PlayerCompute, kFrameTime } = require("./client/player_compute.js");
const fixToFrameTime = (time) => Math.floor(time / kFrameTime) * kFrameTime;

let id = 0;
let allPlayers = {};
let allWs = {};
app.ws("/ws", async (ws, req) => {
    let uid = ++id;
    let timestamp = Date.now();
    let player = PlayerCompute(uid, 0, 0, {
        uid,
        timestamp,
        frames: [],
        status: { x: 0, y: 0 }, // TODO 这个只是计算值，不应该是渲染值，渲染值应该独立，然后进行插值平滑变化
        statusBack: JSON.stringify({ x: 0, y: 0 }),
        statusBackTime: fixToFrameTime(timestamp),
        rollback: false,
        seq: 0,
        lastOnceEndTime: fixToFrameTime(timestamp),
        lastOnneEndFrame: 0,
    });
    ws.send(JSON.stringify({
        func: "connected",
        data: player.data,
    }));
    for (const uid in allPlayers) { // 推送其他玩家的数据
        let one = allPlayers[uid];
        ws.send(JSON.stringify({
            func: "nplayer",
            data: one.data,
        }));
        allWs[uid].send(JSON.stringify({
            func: "nplayer",
            data: player.data,
        }));
    }
    allWs[uid] = ws;
    allPlayers[uid] = player;
    ws.on("message", (msg) => {
        let req = JSON.parse(msg);
        hanlders[req.func](req.data, ws, player);
    });
    ws.on("close", () => {
    });
});
app.listen(8080);
console.log("client display link: http://127.0.0.1:" + 8080);