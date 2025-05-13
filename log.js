function dateToString(date) {
    date = new Date((date ? date.getTime() : Date.now()) + 8 * 60 * 60 * 1000);
    function fix(num, count) {
        let text = "" + num;
        return count <= text.length ? text : new Array(count - text.length).fill(0).join("") + text;
    }
    return `${fix(date.getUTCFullYear(), 4)}-${fix(date.getUTCMonth() + 1, 2)}-${fix(date.getUTCDate(), 2)} ${fix(date.getUTCHours(), 2)}:${fix(date.getUTCMinutes(), 2)}:${fix(date.getUTCSeconds(), 2)}.${fix(date.getUTCMilliseconds(), 3)}`;
}

if (!global.LogInited) {
    global.LogInited = true;

    const fs = require("fs");
    if (!fs.existsSync("./data")) fs.mkdirSync("./data");
    if (!fs.existsSync("./data/log/")) fs.mkdirSync("./data/log/");

    let file = 0;
    let filesize = 0;
    let filename = "";
    let maxSize = 1024 * 1024 * 100;

    function rollfile(date) {
        if (file == 0 || filename == date || filesize > maxSize) {
            let name = "./data/log/" + date + ".log";
            if (fs.existsSync(name)) {
                filesize = fs.statSync(name).size;
                if (filesize > maxSize) {
                    let time = dateToString();
                    fs.renameSync(name, "./data/log/" + time.substring(0, 19).replace(/[\- :]/g, "") + ".log");
                }
            }
            if (file) {
                fs.closeSync(file);
            }
            file = fs.openSync(name, "a+");
            filesize = 0;
            filename = date;
        }
    }
    function code(deep) {
        deep += 1;
        let str = new Error().stack.split("\n")[deep].trim();
        let reg = /\(?(file:\/\/\/|)([^ ]+?):(\d+):(\d+)/g;
        let rst = reg.exec(str);
        let file = rst[2].replaceAll("\\", "/");
        return file.substring(file.lastIndexOf("/") + 1) + ":" + rst[3];
    }
    function log(tag, text) {
        let date = new Date();
        let line = code(3);

        let timeStr = dateToString(date);
        let color = { debug: "", trace: "", info: 32, error: 31, warn: 33 };
        let clr = color[tag] ? `\u001b[${color[tag]}m` : `\u001b[0m`;
        let result = `[${timeStr}][${line}]${clr}[${tag}] ${text}\u001b[0m\n`;

        rollfile(timeStr.split(" ")[0].replaceAll("-", ""));
        fs.writeSync(file, result);
        process.stdout.write(result);
        filesize += Buffer.byteLength(result) + 1;
    }
    console.log = (fmt) => { log("debug", fmt); };
    console.error = (fmt) => { log("error", fmt); };
    console.info = (fmt) => { log("info", fmt); };
    console.warn = (fmt) => { log("warn", fmt); };
    console.trace = (fmt) => { log("trace", fmt); };
}