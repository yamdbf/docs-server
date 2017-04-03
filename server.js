const express = require('express');
const bodyParser = require('body-parser');
const { execSync } = require('child_process');
const config = require('./config.json');

const server = express();

server.use(bodyParser.json());
server.post('/build/:id/:secret', (req, res) => {
	if (config[req.params.id] !== req.params.secret)
		return res.send({ status: 403, body: 'Forbidden.'});
	if (req.headers['x-github-event'] !== 'push')
		return res.send({ status: 204, body: 'Untracked event.'});

	const branch = req.body.ref.match(/refs\/heads\/(.+)/)[1];

	if (!(branch === 'master' || branch === 'stable'))
		return res.send({ status: 204, body: 'Untracked branch.'});
	if (req.body.before === req.body.after)
		return res.send({ status: 204, body: 'No changes.'});

	try
	{
		let result;
		if (branch === 'master')
		{
			console.log(`Starting docs build as of yamdbf/indev#${req.body.after}`);
			result = execSync(`npm install && git pull && gulp && npm run docs:indev && cd ../yamdbf-docs && git commit -am "Build indev docs: ${req.body.after}" && git push`,
				{ cwd: config.indev }).toString();
		}
		else
		{
			console.log(`Starting docs build as of yamdbf/stable#${req.body.after}`);
			result = execSync(`npm install && git pull && gulp && npm run docs:stable && cd ../yamdbf-docs && git commit -am "Build stable docs: ${req.body.after}" && git push`,
				{ cwd: config.stable }).toString();
		}
		console.log(result);
		return res.send({ status: 200, body: 'Successfully built docs.'});
	}
	catch (err)
	{
		console.error(err);
		return res.send({ status: 500, body: 'Failed building docs.'});
	}
});

server.listen(config.port, () => console.log('Server started'));