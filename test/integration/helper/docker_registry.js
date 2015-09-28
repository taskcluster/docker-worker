import devnull from 'dev-null';
import dockerUtils from 'dockerode-process/utils';
import waitForEvent from '../../../lib/wait_for_event';
import slugid from 'slugid';

// Registry proxy image...
const DOCKER_IMAGE = 'registry:2';

export default class Registry {
  constructor(docker) {
    this.docker = docker;
  }

  async start() {
    let docker = this.docker;
    var stream = dockerUtils.pullImageIfMissing(docker, DOCKER_IMAGE);
    // Ensure the test proxy actually exists...
    stream.pipe(devnull());
    await waitForEvent(stream, 'end');

    var createContainer = {
      AttachStdin: false,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      OpenStdin: false,
      StdinOnce: false,
      Env: [
        'REGISTRY_HTTP_TLS_CERTIFICATE=/certs/ssl_cert.crt',
        'REGISTRY_HTTP_TLS_KEY=/certs/ssl_cert.key',
        'REGISTRY_AUTH=htpasswd',
        'REGISTRY_AUTH_HTPASSWD_REALM=Registry Realm',
        'REGISTRY_AUTH_HTPASSWD_PATH=/auth/htpasswd',
        'REGISTRY_HTTP_SECRET=' + slugid.nice()
      ],
      Image: DOCKER_IMAGE,
      Cmd: [],
      ExposedPorts: {
        '5000/tcp': {}
      },
      Volumes: {},
      VolumesFrom: [],
      HostConfig: {
        Binds: [
          '/worker/test/fixtures/:/certs',
          '/worker/test/fixtures/auth:/auth'
        ],
        PortBindings: {
          '5000/tcp': [{Hostport: '0'}]
        }
      }
    };

    var container = await docker.createContainer(createContainer);
    this.container = docker.getContainer(container.id);

    await this.container.start({});

    var portConfig = (await docker.listContainers()).filter(function(item) {
      return item.Id === container.id;
    })[0];

    if (!portConfig) {
      throw new Error('Could not find port configuration');
    }

    // XXX: This is a probable hack as localhost is only true if we run the docker
    // worker in a docker container on the target system... This is a big
    // assumption that happens to be true in the tests at least.
    this.domain = 'localhost:' + portConfig.Ports[0].PublicPort;
    this.url = 'http://' + this.domain + '/';
  }

  imageName(name) {
    return this.domain + '/' + name;
  }

  async close() {
    await this.container.stop();
    await this.container.kill();
  }

  async loadImageWithTag(imageName, user) {
    let docker = this.docker;
    var stream = dockerUtils.pullImageIfMissing(docker, imageName);
    // Ensure the test proxy actually exists...
    stream.pipe(devnull());
    await waitForEvent(stream, 'end');

    let image = await docker.getImage(imageName);
    // TODO
    // does [name,tag] = split work
    let newImageName = `${this.domain}/${user}/${imageName.split(':')[0]}`;
    let tag = imageName.split(':')[1];
    await image.tag({
      repo: newImageName,
      tag: tag,
      force: true
    });

    let newImage = await docker.getImage(newImageName);

    await newImage.push({
      authconfig: {
        username: 'testuser',
        password: 'testpassword'
      }
    });

    await newImage.remove();
    await image.remove();
  }
}
