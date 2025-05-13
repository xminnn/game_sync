function PlayerRender(canvas, keyboard) {
    const ctx = canvas.getContext('2d');
    let renderData = {
        inited: false,
        offset: {
            x: 0,
            y: 0,
        },
        mousedwon: {
            down: false,
            x: 0,
            y: 0,
            offsetx: 0,
            offsety: 0,
        },
        playerdown: {
            down: false,
            move: false,
            x: 0,
            y: 0,
            rx: 0,
            ry: 0,
        }
    };
    let thisUid;
    let player;

    function renderUpdate() {
        function numberToHslColor(num) {
            num *= 131711;
            // 使用数字作为种子生成固定哈希
            let hash = 0;
            for (let i = 0; i < num.toString().length; i++) {
                hash = num.toString().charCodeAt(i) + ((hash << 5) - hash);
                hash = Math.abs(hash);
            }
            // 使用HSL颜色空间 - 固定饱和度和亮度，只变化色相
            const h = hash % 360;
            return `hsl(${h}, 80%, 60%)`;
        }

        function drawPlayer(uid, status) {
            let x = status.x;
            let y = status.y;
            x -= renderData.offset.x;
            y -= renderData.offset.y;
            if (x < 0 || y <= 0 || x > 400 || y > 300) {
                return;
            }
            if (uid == thisUid) {
                ctx.fillStyle = numberToHslColor(thisUid);
                ctx.beginPath();
                ctx.arc(x, y, 10, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = "white";
                ctx.beginPath();
                ctx.arc(x, y, 3, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.fillStyle = numberToHslColor(uid); // 可以更改为任何颜色
                ctx.beginPath();
                ctx.arc(x, y, 10, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (renderData.playerdown.down) {
            ctx.fillStyle = "rgba(220, 219, 219, 0.34)";
            ctx.beginPath();
            ctx.arc(renderData.playerdown.x, renderData.playerdown.y, 40, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "rgba(220, 219, 219)";
            ctx.beginPath();
            ctx.arc(renderData.playerdown.rx, renderData.playerdown.ry, 15, 0, Math.PI * 2);
            ctx.fill();
        }

        for (const uid in allUsers) {
            if (uid == thisUid) {
                continue;
            }
            drawPlayer(uid, allUsers[uid].data.status);
        }
        drawPlayer(thisUid, allUsers[thisUid].data.status);

        ctx.font = "normal 14px Arial";
        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.fillText(`(${renderData.offset.x},${renderData.offset.y}) frameDelay: ${player.getFrameDelay()}ms, delay: ${player.svrDelay}ms`, 10, 10);
        ctx.fill();
    }

    window.oncontextmenu = function (e) {
        e.preventDefault();
    };

    function mousedown( /** @type {MouseEvent}*/ e) {
        if (e.button == 2) {
            renderData.mousedwon.down = true;
            renderData.mousedwon.x = e.offsetX;
            renderData.mousedwon.y = e.offsetY;
            renderData.mousedwon.offsetx = renderData.offset.x;
            renderData.mousedwon.offsety = renderData.offset.y;
        }
        if (e.button == 0) {
            renderData.playerdown.down = Date.now() - 16;
            renderData.playerdown.move = false;
            renderData.playerdown.x = e.offsetX;
            renderData.playerdown.y = e.offsetY;
            renderData.playerdown.rx = e.offsetX;
            renderData.playerdown.ry = e.offsetY;
        }
        e.stopPropagation();
        e.preventDefault();
    }

    // TODO 改成旋转陀螺盘
    function mousemove(/** @type {MouseEvent}*/e) {
        if (renderData.mousedwon.down) {
            let delatx = e.offsetX - renderData.mousedwon.x;
            let delaty = e.offsetY - renderData.mousedwon.y;
            renderData.offset.x = renderData.mousedwon.offsetx - delatx;
            renderData.offset.y = renderData.mousedwon.offsety - delaty;
        }
        // if (renderData.playerdown.down && renderData.playerdown.down + 160 <= Date.now()) {
        if (renderData.playerdown.down) {
            renderData.playerdown.down = Date.now();
            renderData.playerdown.move = true;
            let delatx = e.offsetX - renderData.playerdown.x;
            let delaty = e.offsetY - renderData.playerdown.y;
            let d = Math.sqrt(delatx * delatx + delaty * delaty);
            if (d > 40) {
                renderData.playerdown.rx = renderData.playerdown.x + delatx / d * 40;
                renderData.playerdown.ry = renderData.playerdown.y + delaty / d * 40;
            } else {
                renderData.playerdown.rx = renderData.playerdown.x + delatx;
                renderData.playerdown.ry = renderData.playerdown.y + delaty;
            }

            // 传递移动方向
            let frame = player.sendFrame(Date.now(), kFrameTypeMoveTo, {
                x: delatx / d,
                y: delaty / d,
            });
            ws.send(JSON.stringify({
                func: "frame",
                data: frame
            }));
        }
    }

    function mouseup(/** @type {MouseEvent}*/e) {
        renderData.mousedwon.down = false;
        if (renderData.playerdown.move) {
            renderData.playerdown.move = false;
            // 传递移动方向
            let frame = player.sendFrame(Date.now(), kFrameTypeMoveStop, {});
            ws.send(JSON.stringify({
                func: "frame",
                data: frame
            }));
        }
        renderData.playerdown.down = false;
    }

    canvas.addEventListener("mousedown", mousedown);
    canvas.addEventListener("mousemove", mousemove);
    window.addEventListener("mouseup", mouseup);

    if (keyboard) {
        let keydown = false;
        window.addEventListener("keydown", (e) => {
            if (keydown && keydown == e.key) {
                return;
            }
            let delatx = 0;
            let delaty = 0;
            if (e.key == "w") {
                delaty = -1;
            } else if (e.key == "s") {
                delaty = 1;
            } else if (e.key == "a") {
                delatx = -1;
            } else if (e.key == "d") {
                delatx = 1;
            } else {
                return;
            }
            keydown = e.key;
            // 传递移动方向
            let frame = player.sendFrame(Date.now(), kFrameTypeMoveTo, {
                x: delatx,
                y: delaty,
            });
            ws.send(JSON.stringify({
                func: "frame",
                data: frame
            }));
        });
        window.addEventListener("keyup", (e) => {
            if (!keydown) {
                return;
            }
            keydown = false;

            // 传递移动方向
            let frame = player.sendFrame(Date.now(), kFrameTypeMoveStop, {});
            ws.send(JSON.stringify({
                func: "frame",
                data: frame
            }));
        });
    }

    let allUsers = {};
    let timeoffset = 0;
    const handlers = {
        connected(data) {
            timeoffset = data.timestamp - Date.now(); // 服务器时间偏移，用于校准服务器时间
            console.log("server time offset:", timeoffset);

            thisUid = data.uid;
            player = PlayerCompute(thisUid, timeoffset, thisUid, data);
            let children = setInterval(() => {
                try {
                    let curTime = Date.now();
                    for (const uid in allUsers) {
                        allUsers[uid].onOnce(curTime);
                    }
                    renderUpdate();
                } catch (error) {
                    console.log(error);
                    clearInterval(children);
                }
            }, 16);
            let frame = player.sendFrame(Date.now(), kFrameTypeUserData, {
                x: 100,
                y: 100
            });
            ws.send(JSON.stringify({
                func: "frame",
                data: frame
            }));
            allUsers[thisUid] = player;
        },
        nplayer(data) {
            let nplayer = PlayerCompute(data.uid, timeoffset, thisUid, data);
            allUsers[data.uid] = nplayer;
        },
        frame(frame) {
            if (allUsers[frame.uid]) {
                allUsers[frame.uid].reciFrame(frame);
            }
        },
        heartbeat(data) {
            player.svrDelay = Date.now() - data.reqtime;
        }
    };

    let ws = new WebSocket(`ws://localhost:8080/ws`);
    ws.addEventListener("open", (ev) => {
    });
    ws.addEventListener("message", async (ev) => {
        let msg = JSON.parse(ev.data);
        handlers[msg.func](msg.data, ws);

    });
    ws.addEventListener("close", (ev) => { });
    ws.addEventListener("error", (ev) => { });

    setInterval(() => {
        ws.send(JSON.stringify({
            func: "heartbeat",
            data: {
                reqtime: Date.now()
            }
        }));
    }, 1000);
}