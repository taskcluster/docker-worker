.PHONY: test
test: node_modules
	./node_modules/.bin/mocha $(wildcard *_test.js)

node_modules: package.json
	npm install

.PHONY: test_image
test_image:
	docker -t lightsofapollo/test-taskenv
