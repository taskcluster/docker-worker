CONFIG_FILE=./deploy.json

# Pick up changes when we update variables.js or configure.js
$(CONFIG_FILE): variables.js bin/configure.js
	./bin/configure

# Build the template files
target/%: $(CONFIG_FILE) template/%
	./bin/build-template $(CONFIG_FILE) $^ $@
