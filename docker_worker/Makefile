default: node_modules

test: node_modules
	./node_modules/.bin/mocha $(wildcard *_test.js)

node_modules: package.json
	npm install
