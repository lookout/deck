import { module, IPromise, IQService } from 'angular';
import { chain, extend, find, flatten, has, intersection, keys, some, xor } from 'lodash';

import {
  ACCOUNT_SERVICE,
  AccountService,
  Application,
  CACHE_INITIALIZER_SERVICE,
  CacheInitializerService,
  IAccountDetails,
  IDeploymentStrategy,
  IRegion,
  IServerGroupCommand,
  IServerGroupCommandBackingData,
  IServerGroupCommandBackingDataFiltered,
  IServerGroupCommandDirty,
  IServerGroupCommandResult,
  ISubnet,
  LOAD_BALANCER_READ_SERVICE,
  LoadBalancerReader,
  SERVER_GROUP_COMMAND_REGISTRY_PROVIDER,
  ServerGroupCommandRegistry,
  SUBNET_READ_SERVICE,
  SubnetReader,
} from '@spinnaker/core';

import { IAmazonLoadBalancer } from 'amazon/domain';
import { IamRoleReader } from '../../iamRoles/iamRole.read.service';
import { EscClusterReader } from '../../ecsCluster/ecsCluster.read.service';
import { IRoleDescriptor } from '../../iamRoles/IRole';

export interface IEcsServerGroupCommandDirty extends IServerGroupCommandDirty {
  targetGroup?: string;
}

export interface IEcsServerGroupCommandResult extends IServerGroupCommandResult {
  dirty: IEcsServerGroupCommandDirty;
}

export interface IEcsServerGroupCommandBackingDataFiltered extends IServerGroupCommandBackingDataFiltered {
  targetGroups: string[];
  iamRoles: string[];
  ecsClusters: string[];
}

export interface IEcsServerGroupCommandBackingData extends IServerGroupCommandBackingData {
  filtered: IEcsServerGroupCommandBackingDataFiltered;
  targetGroups: string[];
  ecsClusters: string[];
  iamRoles: IRoleDescriptor[];
}

export interface IEcsServerGroupCommand extends IServerGroupCommand {
  backingData: IEcsServerGroupCommandBackingData;
  targetHealthyDeployPercentage: number;
  targetGroup: string;
}

export class EcsServerGroupConfigurationService {
  // private enabledMetrics = ['GroupMinSize', 'GroupMaxSize', 'GroupDesiredCapacity', 'GroupInServiceInstances', 'GroupPendingInstances', 'GroupStandbyInstances', 'GroupTerminatingInstances', 'GroupTotalInstances'];
  // private healthCheckTypes = ['EC2', 'ELB'];
  // private terminationPolicies = ['OldestInstance', 'NewestInstance', 'OldestLaunchConfiguration', 'ClosestToNextInstanceHour', 'Default'];

  constructor(private $q: IQService,
              private accountService: AccountService,
              private cacheInitializer: CacheInitializerService,
              private subnetReader: SubnetReader,
              private loadBalancerReader: LoadBalancerReader,
              private serverGroupCommandRegistry: ServerGroupCommandRegistry,
              private iamRoleReader: IamRoleReader,
              private ecsClusterReader: EscClusterReader,
              ) {
    'ngInject';
  }

  public configureUpdateCommand(command: IEcsServerGroupCommand): void {
    console.log('bruno bruno bruno');

    command.backingData = {
      // terminationPolicies: clone(this.terminationPolicies)
    } as IEcsServerGroupCommandBackingData;
  }

  public configureCommand(application: Application, command: IEcsServerGroupCommand): IPromise<void> {
    this.applyOverrides('beforeConfiguration', command);
    console.log(application); // TODO (Bruno Carrier): Why do we need to inject an Application into this constructor so that the app works?  This is strange, and needs investigating

    command.toggleSuspendedProcess = (process: string): void => {
      command.suspendedProcesses = command.suspendedProcesses || [];
      const processIndex = command.suspendedProcesses.indexOf(process);
      if (processIndex === -1) {
        command.suspendedProcesses.push(process);
      } else {
        command.suspendedProcesses.splice(processIndex, 1);
      }
    };

    command.processIsSuspended = (process: string): boolean => command.suspendedProcesses.includes(process);

    command.onStrategyChange = (strategy: IDeploymentStrategy): void => {
      // Any strategy other than None or Custom should force traffic to be enabled
      if (strategy.key !== '' && strategy.key !== 'custom') {
        command.suspendedProcesses = (command.suspendedProcesses || []).filter(p => p !== 'AddToLoadBalancer');
      }
    };

    command.regionIsDeprecated = (): boolean => {
      return has(command, 'backingData.filtered.regions') &&
        command.backingData.filtered.regions.some((region) => region.name === command.region && region.deprecated);
    };

    return this.$q.all({
      credentialsKeyedByAccount: this.accountService.getCredentialsKeyedByAccount('aws'), // TODO(Bruno Carrier) : This should use the 'ecs' value, but load balancers are a mess in there.
      loadBalancers: this.loadBalancerReader.listLoadBalancers('aws'),
      subnets: this.subnetReader.listSubnets(),
      iamRoles: this.iamRoleReader.listRoles('ecs', 'continuous-delivery-ecs', 'doesnt matter'),
      ecsClusters: this.ecsClusterReader.listClusters('continuous-delivery-ecs', 'us-west-2'),
    }).then((backingData: Partial<IEcsServerGroupCommandBackingData>) => {
      let loadBalancerReloader = this.$q.when(null);
      console.log('bruno look over here!');
      backingData.accounts = keys(backingData.credentialsKeyedByAccount);
      backingData.filtered = {} as IEcsServerGroupCommandBackingDataFiltered;
      command.backingData = backingData as IEcsServerGroupCommandBackingData;
      this.configureVpcId(command);
      backingData.filtered.iamRoles = this.getIamRoleNames(command);

      if (command.loadBalancers && command.loadBalancers.length) {
        // verify all load balancers are accounted for; otherwise, try refreshing load balancers cache
        const loadBalancerNames = this.getLoadBalancerNames(command);
        if (intersection(loadBalancerNames, command.loadBalancers).length < command.loadBalancers.length) {
          loadBalancerReloader = this.refreshLoadBalancers(command, true);
        }
      }

      return this.$q.all([loadBalancerReloader]).then(() => {
        this.applyOverrides('afterConfiguration', command);
        this.attachEventHandlers(command);
      });
    });
  }

  public applyOverrides(phase: string, command: IEcsServerGroupCommand): void {
    this.serverGroupCommandRegistry.getCommandOverrides('ecs').forEach((override: any) => {
      if (override[phase]) {
        override[phase](command);
      }
    });
  }


  public configureAvailabilityZones(command: IEcsServerGroupCommand): void {
    command.backingData.filtered.availabilityZones =
      find<IRegion>(command.backingData.credentialsKeyedByAccount[command.credentials].regions, { name: command.region }).availabilityZones;
  }

  public configureSubnetPurposes(command: IEcsServerGroupCommand): IServerGroupCommandResult {
    const result: IEcsServerGroupCommandResult = { dirty: {} };
    const filteredData = command.backingData.filtered;
    if (command.region === null) {
      return result;
    }
    filteredData.subnetPurposes = chain(command.backingData.subnets)
      .filter({ account: command.credentials, region: command.region })
      .reject({ target: 'elb' })
      .reject({ purpose: null })
      .uniqBy('purpose')
      .value();

    if (!chain(filteredData.subnetPurposes).some({ purpose: command.subnetType }).value()) {
      command.subnetType = null;
      result.dirty.subnetType = true;
    }
    return result;
  }

  private getLoadBalancerMap(command: IEcsServerGroupCommand): IAmazonLoadBalancer[] {
    return chain(command.backingData.loadBalancers)
      .map('accounts')
      .flattenDeep()
      .filter({ name: command.credentials })
      .map('regions')
      .flattenDeep()
      .filter({ name: command.region })
      .map<IAmazonLoadBalancer>('loadBalancers')
      .flattenDeep<IAmazonLoadBalancer>()
      .value()
  }

  public getLoadBalancerNames(command: IEcsServerGroupCommand): string[] {
    const loadBalancers = this.getLoadBalancerMap(command).filter((lb) => (!lb.loadBalancerType || lb.loadBalancerType === 'classic') && lb.vpcId === command.vpcId);
    return loadBalancers.map((lb) => lb.name).sort();
  }

  public getVpcLoadBalancerNames(command: IEcsServerGroupCommand): string[] {
    const loadBalancersForVpc = this.getLoadBalancerMap(command).filter((lb) => (!lb.loadBalancerType || lb.loadBalancerType === 'classic') && lb.vpcId);
    return loadBalancersForVpc.map((lb) => lb.name).sort();
  }

  public getTargetGroupNames(command: IEcsServerGroupCommand): string[] {
    const loadBalancersV2 = this.getLoadBalancerMap(command).filter((lb) => lb.loadBalancerType !== 'classic') as any[];
    const allTargetGroups = flatten(loadBalancersV2.map<string[]>((lb) => lb.targetGroups));
    return allTargetGroups.sort();
  }

  public getIamRoleNames(command: IEcsServerGroupCommand): string[] {
    const iamRoles = command.backingData.iamRoles as any[];
    const iamRoleNames = flatten(iamRoles.map<string[]>((role) => role.name));
    return iamRoleNames.sort();
  }

  public configureLoadBalancerOptions(command: IEcsServerGroupCommand): IServerGroupCommandResult {
    const result: IEcsServerGroupCommandResult = { dirty: {} };
    const currentLoadBalancers = (command.loadBalancers || []).concat(command.vpcLoadBalancers || []);
    // const currentTargetGroups = command.targetGroup || [];
    const newLoadBalancers = this.getLoadBalancerNames(command);
    const vpcLoadBalancers = this.getVpcLoadBalancerNames(command);
    const allTargetGroups = this.getTargetGroupNames(command);

    if (currentLoadBalancers && command.loadBalancers) {
      const valid = command.vpcId ? newLoadBalancers : newLoadBalancers.concat(vpcLoadBalancers);
      const matched = intersection(valid, currentLoadBalancers);
      const removedLoadBalancers = xor(matched, currentLoadBalancers);
      command.loadBalancers = intersection(newLoadBalancers, matched);
      if (!command.vpcId) {
        command.vpcLoadBalancers = intersection(vpcLoadBalancers, matched);
      } else {
        delete command.vpcLoadBalancers;
      }
      if (removedLoadBalancers.length) {
        result.dirty.loadBalancers = removedLoadBalancers;
      }
    }

    // if (currentTargetGroups && command.targetGroup) {
    //   const matched = intersection(allTargetGroups, currentTargetGroups);
    //   const removedTargetGroups = xor(matched, currentTargetGroups);
    //   command.targetGroup = intersection(allTargetGroups, matched);
    //   if (removedTargetGroups.length) {
    //     result.dirty.targetGroup = removedTargetGroups;
    //   }
    // }

    command.backingData.filtered.loadBalancers = newLoadBalancers;
    command.backingData.filtered.vpcLoadBalancers = vpcLoadBalancers;
    command.backingData.filtered.targetGroups = allTargetGroups;
    return result;
  }

  public refreshLoadBalancers(command: IEcsServerGroupCommand, skipCommandReconfiguration?: boolean) {
    return this.cacheInitializer.refreshCache('loadBalancers').then(() => {
      return this.loadBalancerReader.listLoadBalancers('aws').then((loadBalancers) => {
        command.backingData.loadBalancers = loadBalancers;
        if (!skipCommandReconfiguration) {
          this.configureLoadBalancerOptions(command);
        }
      });
    });
  }

  public configureVpcId(command: IEcsServerGroupCommand): IEcsServerGroupCommandResult {
    const result: IEcsServerGroupCommandResult = { dirty: {} };
    if (!command.subnetType) {
      command.vpcId = null;
      result.dirty.vpcId = true;
    } else {
      const subnet = find<ISubnet>(command.backingData.subnets, { purpose: command.subnetType, account: command.credentials, region: command.region });
      command.vpcId = subnet ? subnet.vpcId : null;
    }
    return result;
  }

  public attachEventHandlers(command: IEcsServerGroupCommand): void {
    console.log('bruno look at these handlers attaching');

    command.subnetChanged = (): IServerGroupCommandResult => {
      const result = this.configureVpcId(command);
      extend(result.dirty, this.configureLoadBalancerOptions(command).dirty);
      command.viewState.dirty = command.viewState.dirty || {};
      extend(command.viewState.dirty, result.dirty);
      return result;
    };

    command.regionChanged = (): IServerGroupCommandResult => {
      const result: IEcsServerGroupCommandResult = { dirty: {} };
      const filteredData = command.backingData.filtered;
      extend(result.dirty, this.configureSubnetPurposes(command).dirty);
      if (command.region) {
        extend(result.dirty, command.subnetChanged().dirty);

        this.configureAvailabilityZones(command);
      } else {
        filteredData.regionalAvailabilityZones = null;
      }

      return result;
    };

    command.credentialsChanged = (): IServerGroupCommandResult => {
      const result: IEcsServerGroupCommandResult = { dirty: {} };
      const backingData = command.backingData;
      if (command.credentials) {
        const regionsForAccount: IAccountDetails = backingData.credentialsKeyedByAccount[command.credentials] || { regions: [] } as IAccountDetails;
        backingData.filtered.regions = regionsForAccount.regions;
        if (!some(backingData.filtered.regions, { name: command.region })) {
          command.region = null;
          result.dirty.region = true;
        } else {
          extend(result.dirty, command.regionChanged().dirty);
        }
      } else {
        command.region = null;
      }
      return result;
    };

    this.applyOverrides('attachEventHandlers', command);
  }

}

export const ECS_SERVER_GROUP_CONFIGURATION_SERVICE = 'spinnaker.ecs.serverGroup.configure.service';
module(ECS_SERVER_GROUP_CONFIGURATION_SERVICE, [
  require('amazon/image/image.reader.js').name,
  ACCOUNT_SERVICE,
  SUBNET_READ_SERVICE,
  LOAD_BALANCER_READ_SERVICE,
  CACHE_INITIALIZER_SERVICE,
  SERVER_GROUP_COMMAND_REGISTRY_PROVIDER,
])
  .service('ecsServerGroupConfigurationService', EcsServerGroupConfigurationService);
