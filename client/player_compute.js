const kFrameTypeUserData = 2;
const kFrameTypeMoveTo = 3;
const kFrameTypeMoveStop = 4;

const kFrameTime = 16;

function PlayerCompute(uid, timeOffset, baseUid, player) {

    let frameDelay = 0;
    let fixToFrameTime = (time) => Math.floor(time / kFrameTime) * kFrameTime;
    let getServerTime = (time) => time + timeOffset; // 仅保证时间与服务器返回的那一刻对齐。无需与UTC对齐。降低回滚概率
    // TODO getServerTime 需要优化一下，从而降低自身与服务器的时间偏差，降低预测回滚的概率

    function onFrameData(frame) { // 帧中的事件
        switch (frame.type) {
            case kFrameTypeUserData: { // 全量同步玩家数据
                player.status = JSON.parse(JSON.stringify(frame.data));
            } break;
            case kFrameTypeMoveTo: { // 玩家移动到指定位置
                player.status.moveTo = JSON.parse(JSON.stringify(frame.data));
            } break;
            case kFrameTypeMoveStop: {
                delete player.status.moveTo;
            } break;
            default: {
            } break;
        }
    }
    function onFrameStep() { // 这一帧需要做的事情
        let status = player.status;
        if (status.moveTo) {
            let deltax = status.moveTo.x;
            let deltay = status.moveTo.y;
            const speed = 4;
            status.x += speed * deltax;
            status.y += speed * deltay;
            if (status.x < 10) {
                status.x = 10;
            }
            if (status.x > 290) {
                status.x = 290;
            }
            if (status.y < 10) {
                status.y = 10;
            }
            if (status.y > 290) {
                status.y = 290;
            }
            status.x = Number.parseFloat(status.x.toFixed(3));
            status.y = Number.parseFloat(status.y.toFixed(3));
        }
    }

    let computeDelay = 200;
    return {
        data: player,
        getFrameDelay() {
            return frameDelay;
        },
        sendFrame(localTime, type, data) {
            let frame = {
                id: ++player.seq,
                timestamp: getServerTime(localTime),
                client: getServerTime(localTime),
                uid: uid,
                type: type,
                data: data,
            };
            if (baseUid == uid) {
                player.frames.push(frame);
            }
            return frame;
        },
        reciFrame(frame) {
            frameDelay = getServerTime(Date.now()) - frame.client;
            frame.isServer = true;
            if (frame.timestamp < player.statusBackTime) {
                throw new Error("error frame, need full pull again");
            }
            let delayRollback = () => { // 判断是否需要回滚，同时动态设置延迟计算时间，降低回滚概率
                let delay = player.lastOnceEndTime - frame.timestamp;
                if (baseUid == 0) { // 服务器稳定 computeDelay 为200
                    if (delay >= 0) {
                        player.rollback = true;
                    }
                    return;
                }
                // 只有自己和观察者需要动态调整。自己调整是因为存在服务器插针，同时尽可能
                if (delay > 0) {
                    player.rollback = true; // 观测者也需要回滚?, 解决同帧遗漏？
                    console.log(`rollback: baseUid=${baseUid} uid=${uid}, delay=${delay}, computeDelay=${computeDelay}`);
                    computeDelay += 10;
                } else {
                    if (baseUid == uid) {
                        /**
                            实时控制依赖于计算机那半边的情况，需要计算机一直维持着三个重要的值：
                            - 运动的印象（需要以大于10 fps的帧率显示）。屏幕上显示的帧率必须大于10帧每秒，这样才能维持运动的印象。当帧率处于20～30 fps时，运动的印象会更好更流畅。
                            - 即时响应（从输入到显示要在240 ms以内）。在交互过程中，计算机那半边的处理时间必须小于玩家的修正循环时间。当这个时间在50 ms时，人会觉得响应是瞬时发生的。当超过100 ms时，延时开始明显起来了，但还可以忽略不计。到了200 ms时，响应就会显得行动迟缓了。
                            - 连续响应（计算机在交互过程中的循环时间需要保持在恒定的100 ms以内）。

                            Mick分析，大部分游戏响应时间在50~100ms内的游戏能让玩家明显感觉“紧凑”和“响应灵敏”，一旦超出这个范围，游戏的操作就会开始显得行动迟缓
                            以高桥名人单指每秒按键最快16次为例，手柄的按键以2mm键程为例，按一次键需要62.5ms。即2mm触发键程时，人类极限为两次按键间隔最短62.5ms，
                            
                            delay < -100 能够优化服务器插值，降低玩家操作频率(技能能却，前后摇等)。就能基本上保证玩家的体验
                         */
                        if (delay < -100) { // 这个值根据游戏特性来更改：预测失败率越大这个值应该越大，同时会造成玩家手感越差。 主要受到一下两个方面的因素影响： 1. 服务器插帧率越高，预测失败率越大 2. 客户端操作越平凡(每秒上百frame)，如果服务器发生纠正的话，会更多的导致预测失败
                            computeDelay -= 1;
                        }
                    } else {
                        if (delay < -200) { // 观察者，取决于
                            computeDelay -= 1;
                        }
                    }
                }
                if (computeDelay < 16) {
                    computeDelay = kFrameTime;
                }
            };
            if (baseUid == uid) { // 查找预测帧，然后根据需要判断是否需要回滚
                let p = player.frames.findIndex(a => a.id == frame.id);
                if (p >= 0) {
                    if (frame.timestamp != player.frames[p].timestamp) { // 时间被改了，需要主动回滚计算
                        delayRollback();
                    }
                    player.frames.splice(p, 1);
                } else {
                    delayRollback();
                }
                player.frames.push(frame);
                player.frames.sort((a, b) => {
                    if (a.timestamp == b.timestamp) {
                        return a.id - b.id; // 时间戳相同，则按照id排序
                    }
                    return a.timestamp - b.timestamp;
                });  // 服务器会重新纠正实际的时间戳。服务器不会进行回滚操作，只会不断地向前计算
            } else {
                delayRollback();
                player.frames.push(frame);
            }
        },
        onOnce(localTime) {
            let curTime = getServerTime(localTime) - computeDelay;
            let curFrameTime = fixToFrameTime(curTime);
            let time;
            let frame;

            let safe = 0;
            function safeWhile() {
                if (safe++ > 100000) {
                    throw new Error(`error compute: time=${time}, curFrameTime=${curFrameTime}, ${curFrameTime - time}, frame=${frame}, ${player.frames.length}`);
                }
            }

            if (player.rollback || player.statusBackTime + 2000 < curFrameTime) { // 这个回滚算法虽然能够保持一致性，但是似乎存在一些问题，回滚就会发生抖动，理论上在没有实际rollback的时候不应该有抖动现象
                if (player.rollback)
                    console.log(`rollback: baseUid=${baseUid} uid=${uid}, timepass=${curFrameTime - player.statusBackTime}`);

                player.rollback = false;
                let endTime = 0;
                for (let i = 0; i < player.frames.length; i++) {
                    if (player.frames[i].isServer) {
                        endTime = fixToFrameTime(player.frames[i].timestamp) - computeDelay; // 状态至少保留2帧时间段
                    } else {
                        break;
                    }
                }
                let compareTime = fixToFrameTime(curFrameTime - 400);
                if (player.statusBackTime < compareTime && endTime < compareTime) {
                    endTime = compareTime;
                }

                player.status = JSON.parse(player.statusBack);
                time = fixToFrameTime(player.statusBackTime);
                frame = 0;
                if (endTime > 0) {
                    for (; time < endTime; time += kFrameTime) {
                        safeWhile();
                        for (; frame < player.frames.length; frame++) { // 先处理所有的帧输入
                            safeWhile();
                            if (player.frames[frame].timestamp >= time + kFrameTime) {
                                break;
                            }
                            onFrameData(player.frames[frame]);
                        }
                        onFrameStep(time);
                    }
                    player.frames.splice(0, frame);
                    player.statusBack = JSON.stringify(player.status);
                    player.statusBackTime = time;
                    frame = 0;
                }
                player.lastOnneEndFrame = frame;
                player.lastOnceEndTime = time;
            }

            // 向前推进
            frame = player.lastOnneEndFrame;
            time = player.lastOnceEndTime;
            for (; time < curFrameTime; time += kFrameTime) {
                safeWhile();
                for (; frame < player.frames.length; frame++) { // 先处理所有的帧输入
                    safeWhile();
                    if (player.frames[frame].timestamp >= time + kFrameTime) {
                        break;
                    }
                    onFrameData(player.frames[frame]);
                }
                onFrameStep(time);
            }
            player.lastOnceEndTime = time;
            player.lastOnneEndFrame = frame;
        }
    };
}

try {
    if (typeof module) {
        module.exports = { PlayerCompute, kFrameTime };
    }
} catch (error) {
}
