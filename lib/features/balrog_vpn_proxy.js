import waitForPort from '../wait_for_port';
import { pullDockerImage } from '../pull_image_to_stream';
import assert from 'assert';
import { scopeMatch } from 'taskcluster-base/utils';

// Prefix used in scope matching for docker-worker features
const FEATURE_SCOPE_PREFIX = 'docker-worker:feature:';

// Prefix used in scope matching for authenticated docker images.
const IMAGE_SCOPE_PREFIX = 'docker-worker:image:';

// Alias used to link the proxy.
const ALIAS = 'balrog';

// Maximum time in MS to wait for the proxy socket to become available.
const INIT_TIMEOUT = 5000;

export default class BalrogVPNProxy {
  constructor () {
    this.featureName = 'balrogVPNProxy';
    /**
    Docker container used in the linking process.
    */
    this.container = null;
  }

  async link(task) {
    var docker = task.runtime.docker;
    // Image name for the proxy container.
    var image = task.runtime.balrogVPNProxyImage;

    let featureScope = FEATURE_SCOPE_PREFIX + this.featureName;
    if (!scopeMatch(task.task.scopes, featureScope)) {
      throw new Error(
        `Insufficient scopes to use '${this.featureName}' feature.  ` +
        `Try adding ${featureScope} to the .scopes array.`
      );
    }

    // If feature is granted by scope match, grant image scope used for
    // pulling docker image
    let imageScopes = [`${IMAGE_SCOPE_PREFIX+image}`];

    assert(
      task.runtime.features.balrogVPNProxy.url,
      "Must specify balrog URL to use Balrog vpn proxy service."
    );
    const PROXY_ADDR = task.runtime.features.balrogVPNProxy.url;

    await pullDockerImage(
      task.runtime,
      image,
      imageScopes,
      task.taskId,
      task.runId,
      process.stdout
    );

    // create the container.
    this.container = await docker.createContainer({
      Image: image,
      Env: [`PROXIED_SERVER=${PROXY_ADDR}`],
      Tty: true,
      AttachStdin: false,
      AttachStdout: true,
      AttachStderr: true,
      HostConfig: {
        // Needed for creating tun device and manipulating routing tables
        CapAdd: ["NET_ADMIN"]
      }
    });

    // Terrible hack to get container promise proxy.
    this.container = docker.getContainer(this.container.id);

    await this.container.start({});

    var inspect = await this.container.inspect();
    var name = inspect.Name.slice(1)

    try {
      // wait for the initial server response...
      await waitForPort(inspect.NetworkSettings.IPAddress, '80', INIT_TIMEOUT);
    } catch (e) {
      throw new Error('Failed to initialize balrog vpn proxy service.');
    }

    return [{ name: name, alias: ALIAS }];
  }

  async killed(task) {
    var stats = task.runtime.stats;
    console.log("in balrog vpn proxy");
    // Attempt to gracefully stop the container prior to the GC forcefully
    // removing it.  Also, this will ensure the vpn connection is closed
    // as soon as possible.
    this.container.stop();
    task.runtime.gc.removeContainer(this.container.id);
  }
}
