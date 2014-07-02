#!/bin/bash -e
wget -q -O - https://www.loggly.com/install/configure-syslog.py | sudo python - setup --auth c7c57b5e-568e-49a2-9206-62a4681cfeed --account lightsofapollo --yes
