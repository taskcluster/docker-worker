TARGET?=taskcluster/docker-worker

.PHONY: docker_worker
docker_worker:
	docker build -t $(TARGET) docker_worker
