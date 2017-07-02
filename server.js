const express = require('express');
const bodyParser = require('body-parser');
const { execSync } = require('child_process');
const config = require('./config.json');
const Build = require('github-build');

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

	const data = {
		repo: 'zajrik/yamdbf',
		sha: req.body.after,
		token: config.token,
		label: 'YAMDBF Docs Build',
		description: 'Building docs...',
		url: 'https://yamdbf.js.org'
	}

	const build = new Build(data);
	build.start().then(() => {
		try
		{
			let result;
			let type = branch === 'master' ? 'indev' : 'stable';
			let opts = { cwd: config[type] };

			console.log(`Starting docs build as of yamdbf/${type}#${req.body.after}`);
			execSync('git clean -df && git checkout .', opts);
			execSync('git pull', opts);
			try { execSync('rm -rf node_modules', opts); } catch (err) {}
			try { execSync('rm package-lock.json', opts); } catch (err) {}
			execSync('npm install && gulp', opts)

			// Attempt to build the localization string list before building docs,
			// ignoring the attempt if anything bad happens
			try { execSync('npm run localization', opts); } catch (err) {}

			execSync(`npm run docs:${type}`, opts);
			let gitStatus = execSync(`cd ../yamdbf-docs && git status`, opts).toString();
			if (gitStatus.includes('nothing to commit'))
			{
				data.description = 'No docs changes.';
				build.pass();
			}
			else
			{
				result = execSync(
					`cd ../yamdbf-docs && git add --all && git commit -m "Build ${type} docs: ${req.body.after}" && git push`,
					opts).toString();
				
				console.log(result);
				data.description = 'Successfully built docs.';
				build.pass();
			}
			
			return res.send({ status: 200, body: 'Successfully built docs.'});
		}
		catch (err)
		{
			console.error(err);
			data.description = 'Docs build failed.';
			build.fail();
			return res.send({ status: 500, body: 'Failed building docs.'});
		}
	})
	.catch(console.error);
});

server.listen(config.port, () => console.log('Server started'));