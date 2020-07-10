const http = require('http');
const path = require('path');
const fs   = require('fs');

const fsPromises  = fs.promises;
const tmi         = require('tmi.js');

// Bot settings
const config       = require('./data/config');

// const target       = '#yueshh';
const target       = '#tardesy';

const bots_names   = ['tima_bot', 'streamelements'];
const admins       = ['homaander', 'yueshh', 'mrfizic228'];
const command_list = ['!coins', '!info', '!shoot', '!gift', '!case', '!duel', '!say', '!+', '!-', '!=', '!?'];

// Bot vars
// let chat      = '';
let cool_down = {};
let bet_list  = [];

// Start bot
const client = new tmi.client(config.opts);

client.on('connected', (addr, port) => { log(`- Успешное соединение: ${addr}:${port}`); });
client.on('message', renderMsg);
client.connect();

// Save data
setInterval(save_data, 30 * 1000);

// API
const server = http.createServer(render);
server.listen(8080, () => log('Server has been started...'));

function render(request, response) {
	log(request.url);

	// API
	if (request.url === '/api/action') {
		response.writeHead(200, {'Content-Type': 'text/plain;charset=utf-8'});
		response.end(JSON.stringify({'status': 'ok'}));
	}

    let url = request.url.split('?')[0];

	// TimaUI
	let file_name = (url === '/')? 'index.html' : `${url}`;

	let file_path = path.join(__dirname, 'UI', file_name);


	fs.readFile(file_path, (err, data) => {
		if (err) {
			response.writeHead(404, {'Content-Type': 'text/html'});
			response.end('404');
		}

		response.writeHead(200, {'Content-Type': 'text/html'});
		response.end(data);
	});
}

// Bot
function renderMsg(target_, context, msg, self) {
    if (self) return;

    msg = msg.trim().toLowerCase();

    let content = msg.split(' ');

    // Сохранение чата
    // chat += `[${(new Date()).toLocaleTimeString()}] ${context.username}: ${msg} \n`;

    // Приветствие
    if (config.points[context.username] === undefined) {
        client.say(target, `${context.username} тут впервые!!!`);
        config.points[context.username] = 500;

        log(`${context.username} тут впервые!!!`);
    }

    // Добавить очки за сообщение
    if (msg[0] !== '!' || command_list.indexOf(content[0]) === -1)
        return config.points[context.username] += 5;

    // КД
    if (cool_down[context.username] + 5 * 1000 > Date.now()) return;
    cool_down[context.username] = Date.now()

    // Функциональные
    switch (content[0]) {
        case '!info' : return info(context.username);
        case '!duel' : return duel(context.username, content[1], content[2]);
        case '!gift' : return gift(context.username, content[1], content[2]);

        case '!coins': return coins(context.username);
        case '!shoot': return shoot(context.username, content[1]);

        case '!case' : return open_case(context.username);

        case '!say':
            if (context.username !== 'homaander') return;
            return client.say(target, `${msg.substring(4)}`);


        case '!+': return set(context.username, content[1], config.points[content[1]] + Number(content[2]));
        case '!-': return set(context.username, content[1], config.points[content[1]] - Number(content[2]));    
        case '!=': return set(context.username, content[1], content[2]);

        case '!?':
            if (admins.indexOf(context.username) === -1) return;

            if (config.points[content[1]] === undefined)
                return client.say(target, `${context.username}, пользователь ${content[1]} не найден`);

            return coins(content[1]);
    }
}

async function save_data() {
    await fsPromises.writeFile('data/points.json', JSON.stringify(config.points));

    // await fsPromises.appendFile(`data/chat/${(new Date()).toLocaleDateString()}.txt`, chat);
    // chat = "";

    log(`Данные сохранены`);
}

function log(msg) {
    console.log(`- [${(new Date()).toLocaleTimeString()}] ${msg}`);
}



/*
    Commands
*/
function info(nick) {
    client.say(target, `
        Список комманд:
        !coins - Проверка баланса монет; 
        !shoot [ник] - стоимость 100, попытатся выстрельнуть и забрать монеты;
        !gift  [ник] [монеты] - подарить монеты;
        !case - стоимость 1000 Открыть кейс с монетам;
        !duel [ник] [ставка > 500] - Вызвать на дуэль
        `);

    log(`Запрос на справку от ${nick}`);
}



function coins(nick) {
    client.say(target, `Монеты ${nick}: ${config.points[nick]}`);
    client.whisper('homaander', `Монеты ${nick}: ${config.points[nick]}`);
    log(`Запрос на монеты пользователя ${nick}: ${config.points[nick]}`);
}



function shoot(nick, to_nick) {
    // Пользователь не найден
    if (config.points[to_nick] === undefined)
        return client.say(target, `${context.username}, пользователь ${to_nick} не найден`);

    // Если это сам бот
    if (bots_names.indexOf(to_nick) !== -1)
        return client.say(target, `${nick}, Непонял Kappa`);

    // Сам в себя
    else if (to_nick === nick)
        return client.say(target, `${nick}, Не надо так :)`);

    // Плата за команду
    if (config.points[nick] < 100) {
        client.say(target, `${nick}, не хватает монет для покупки выстрела: ${100 - config.points[nick]}`);
        return log(`${nick} ПЫТАЛСЯ выстрелить в ${to_nick}`);
    }
    config.points[nick] -= 100;

    let shoot = Math.random();
    let status = '';

    // Промах
    if (shoot < 0.25) {
        client.say(target, `${nick} промахнулся(ась), счёт ${to_nick} не пострадал`);
        status = 'промах';
    }
    // Рикошет
    else if (shoot < 0.5) {
        config.points[nick] -= 150;
        if (config.points[nick] < 0) config.points[nick] = 0;

        client.say(target, `Пуля отрекошетила, и попала обратно в ${nick}. Он(а) потратит на лечение 150 монет`);
        status = 'рикошет';
    }
    // Попадание
    else {
        let miss = false;
        let prise = 0;
        let pref = "";

        // Не в того
        if (shoot >= 0.5 && shoot < 0.6) {
            let keys = Object.keys(cool_down);
            to_nick = keys[keys.length * Math.random() << 0];
            miss = true;
        }

        if (config.points[to_nick] < 150)
            prise = config.points[to_nick];
        else 
            prise = 150;

        config.points[to_nick] -= prise;
        config.points[nick]    += prise;

        if (prise < 150) pref = 'последние';

        if (!miss) client.say(target, `${nick} попал(а) в ${to_nick} и своровал ${pref} ${prise} монет`);
        else client.say(target, `Ой, ${nick} случайно попал(а) в ${to_nick} и своровал ${pref} ${prise} монет`);

        status = 'попадание';
    }

    log(`Выстрел от ${nick} в ${to_nick}: ${status}`);
}



function open_case(nick) {
    if (config.points[nick] < 1000) {
        client.say(target, `${nick}, не хватает монет для покупки кейса: ${1000 - config.points[nick]}`);
        return log(`${nick} ПЫТАЛСЯ открыть кейс`);
    }
    config.points[nick] -= 1000;

    let fart  = Math.random();
    let prise = 0;

    if (fart < 0.3) {
        client.say(target, `${nick} Кейс оказался пустым`); prise = 0;
    }
    else if (fart < 0.6) {
        client.say(target, `${nick} Ну почти, из кейса выпало 900 монет`); prise = 900;
    }
    else if (fart < 0.9) {
        client.say(target, `${nick} Вау, из кейса выпало 1500 монет`); prise = 1500;
    }
    else {
        client.say(target, `${nick} Джекпот!!! из кейса выпало 2000 монет`); prise = 2000;
    }

    config.points[nick] += prise;

    log(`${context.username}: открыл(ла) кейс: ${prise}`);
}



function gift(nick, to_nick, count) {
    if (config.points[to_nick] === undefined)
        return client.say(target, `${context.username}, пользователь ${to_nick} не найден`);
    
    if (!count || isNaN(Number(count))) count = 0

    if (count < 0)  {
        client.say(target, `${nick}, пытался(ась) украсть монеты у ${to_nick}`);
        return log(`${nick} ПЫТАЛСЯ подарить ${to_nick} монет: ${count}`);
    }

    if ((config.points[nick] - count) < 0)  {
        client.say(target, `${nick}, не хватает монет для подарка: ${count - config.points[nick]}`);
        return log(`${nick} ПЫТАЛСЯ подарить ${to_nick} монет: ${count}`);
    }

    config.points[nick]    -= Number(count);
    config.points[to_nick] += Number(count);

    client.say(target, `${nick} дарит ${to_nick} монет: ${count}`);

    log(`${nick} дарит ${to_nick} монет: ${count}`);
}



function duel(nick, to_nick, count) {
    // Пользователь не найден
    if (config.points[to_nick] === undefined)
        return client.say(target, `${context.username}, пользователь ${to_nick} не найден`);

    if (!count || isNaN(Number(count))) count = 0

    // Если это сам бот
    if (bots_names.indexOf(to_nick) !== -1)
        return client.say(target, `${nick}, Непонял Kappa`);
    // Сам в себя
    else if (to_nick === nick) 
        return client.say(target, `${nick}, Не надо так :)`);

    if ((config.points[nick] - count) < 0)  {
        client.say(target, `${nick}, не хватает монет для дуэль: ${count - config.points[nick]}`);
        return log(`${nick} ПЫТАЛСЯ вызвать ${to_nick} на монет: ${count}`);
    }
    config.points[nick] -= Number(count);

    // Минимальная ставка
    if (count < 500) {
        client.say(target, `${nick}, минимальная ставка на дуэль - 500`);
        return log(`${nick} ПЫТАЛСЯ вызвать на дуэль ${to_nick} монет: ${сount}`);
    }

    let conteins = false;
    let bet_index = -1;

    // Поиск открытого пари
    for (let i = 0; i < bet_list.length; i++) {
        if (bet_list[i][0] === tщ_nick && bet_list[i][1] === nick) {
            conteins = true;
            count = Number(count) + Number(bet_list[i][2]);
            bet_index = i;
            break;
        }
    }

    // Это приглошение
    if (!conteins) {
        bet_list[bet_list.length] = [nick, to_nick, count];
        client.say(target, `${nick} вызвал на дуэль ${to_nick}`);
        log(`Пари создано: ${nick} вызвал ${to_nick}`);
    }

    // Это ответ
    else {
        bet_list.splice(bet_index, 1);
        client.say(target, `${nick} принял вызов от ${to_nick}, банк: ${count}`);

        while (true) {
            let p = Math.random();

            if (p > 0.55) {
                client.say(target, `Победу одержал(а) ${nick}! ${Math.round(p*10)}:${Math.round((1 - p)*10)}`);
                config.points[nick] += Number(count);
                log(`Пари принято: ${nick} принял вызов от ${to_nick}, победа ${nick}, приз: ${count}`);
                break;
            }
            else if (p < 0.45) {
                client.say(target, `Победу одержал ${to_nick}! ${Math.round((1 - p)*10)}:${Math.round(p*10)}`);
                config.points[to_nick] += Number(count);
                log(`Пари принято: ${nick} принял вызов от ${to_nick}, победа ${to_nick}, приз: ${count}`);
                break;
            }
        }
    }
}



function set(nick, to_nick, count) {
    if (admins.indexOf(nick) === -1) return;

    if (config.points[to_nick] === undefined)
        return client.say(target, `${context.username}, пользователь ${to_nick} не найден`);

    if (!count || isNaN(Number(count))) count = 0

    config.points[to_nick] = Number(count);
    if (config.points[to_nick] < 0) config.points[to_nick] = 0;

    client.say(target, `${nick} устанавливает ${to_nick} монет: ${count}`);

    log(`${nick} устанавливает ${to_nick} монет: ${count}`);
}
