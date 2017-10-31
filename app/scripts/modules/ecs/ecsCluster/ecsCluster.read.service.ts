import {module} from 'angular';

import {API_SERVICE, Api} from 'core/api/api.service';

export class EscClusterReader {
public constructor(private API: Api) { 'ngInject'; }

  public listClusters(account: string, region: string): ng.IPromise<string[]> {
    return this.API.all('ecsClusters').all(account).all(region).getList();
  }

}


export const ECS_CLUSTER_READ_SERVICE = 'spinnaker.ecs.ecsCluster.read.service';

module(ECS_CLUSTER_READ_SERVICE, [
  API_SERVICE
]).service('ecsClusterReader', EscClusterReader);
