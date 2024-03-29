#!/usr/bin/env node
'use strict';
const { URL } = require('url');
const meow = require('meow');
const speedtest = require('speedtest-net');
const updateNotifier = require('update-notifier');
const roundTo = require('round-to');
const chalk = require('chalk');
const logUpdate = require('log-update');
const logSymbols = require('log-symbols');
const Ora = require('ora');

const cli = meow(`
	Usage
	  $ speed-test

	Options
	  --json -j     Output the result as JSON
	  --bytes -b    Output the result in megabytes per second (MBps)
      --verbose -v  Output more detailed information
      --timer -t    Repeat test on a timer (minutes)
`, {
	flags: {
		json: {
			type: 'boolean',
			alias: 'j'
		},
		bytes: {
			type: 'boolean',
			alias: 'b'
		},
		verbose: {
			type: 'boolean',
			alias: 'v'
        },
        timer: {
            type: 'number',
            alias: 't'
        }
	}
});

updateNotifier({pkg: cli.pkg}).notify();

const stats = {
	ping: '',
	download: '',
	upload: ''
};

let state = 'ping';
const spinner = new Ora();
const unit = cli.flags.bytes ? 'MBps' : 'Mbps';
const multiplier = cli.flags.bytes ? 1 / 8 : 1;

const getSpinnerFromState = inputState => inputState === state ? chalk.gray.dim(spinner.frame()) : '  ';

const logError = error => {
	if (cli.flags.json) {
		console.error(JSON.stringify({error}));
	} else {
		console.error(logSymbols.error, error);
	}
};

function render() {
	if (cli.flags.json) {
		console.log(JSON.stringify(stats));
		return;
	}

	let output = `
      Ping ${getSpinnerFromState('ping')}${stats.ping}
  Download ${getSpinnerFromState('download')}${stats.download}
    Upload ${getSpinnerFromState('upload')}${stats.upload}`;

	if (cli.flags.verbose) {
		output += [
			'',
			'    Server   ' + (stats.data === undefined ? '' : chalk.cyan(stats.data.server.host)),
			'  Location   ' + (stats.data === undefined ? '' : chalk.cyan(stats.data.server.location + chalk.dim(' (' + stats.data.server.country + ')'))),
			'  Distance   ' + (stats.data === undefined ? '' : chalk.cyan(roundTo(stats.data.server.distance, 1) + chalk.dim(' km')))
		].join('\n');
	}

	logUpdate(output);
}

function setState(newState) {
	state = newState;

	if (newState && newState.length > 0) {
		stats[newState] = chalk.yellow(`0 ${chalk.dim(unit)}`);
	}
}

function map(server) {
	server.host = new URL(server.url).host;
	server.location = server.name;
	server.distance = server.dist;
	return server;
}

var minutes = 5, the_interval = minutes * 60 * 1000;
setInterval(function() {
  console.log("I am doing my 5 minutes check");
  const st = speedtest({maxTime: 20000});
}, the_interval);

if (!cli.flags.json) {
	setInterval(render, 50);
}

st.once('testserver', server => {
	if (cli.flags.verbose) {
		stats.data = {
			server: map(server)
		};
	}

	setState('download');
	const ping = Math.round(server.bestPing);
	stats.ping = cli.flags.json ? ping : chalk.cyan(ping + chalk.dim(' ms'));
});

st.on('downloadspeedprogress', speed => {
	if (state === 'download' && cli.flags.json !== true) {
		speed *= multiplier;
		const download = roundTo(speed, speed >= 10 ? 0 : 1);
		stats.download = chalk.yellow(`${download} ${chalk.dim(unit)}`);
	}
});

st.on('uploadspeedprogress', speed => {
	if (state === 'upload' && cli.flags.json !== true) {
		speed *= multiplier;
		const upload = roundTo(speed, speed >= 10 ? 0 : 1);
		stats.upload = chalk.yellow(`${upload} ${chalk.dim(unit)}`);
	}
});

st.once('downloadspeed', speed => {
	setState('upload');
	speed *= multiplier;
	const download = roundTo(speed, speed >= 10 && !cli.flags.json ? 0 : 1);
	stats.download = cli.flags.json ? download : chalk.cyan(download + ' ' + chalk.dim(unit));
});

st.once('uploadspeed', speed => {
	setState('');
	speed *= multiplier;
	const upload = roundTo(speed, speed >= 10 && !cli.flags.json ? 0 : 1);
	stats.upload = cli.flags.json ? upload : chalk.cyan(upload + ' ' + chalk.dim(unit));
});

st.on('data', data => {
	if (cli.flags.verbose) {
		stats.data = data;
	}

	render();
});

st.on('done', () => {
	console.log();
	process.exit();
});

st.on('error', error => {
	if (error.code === 'ENOTFOUND') {
		logError('Please check your internet connection');
	} else {
		logError(error);
	}

	process.exit(1);
});