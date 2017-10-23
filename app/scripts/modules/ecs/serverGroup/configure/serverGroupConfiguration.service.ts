
import { module, IPromise, IQService } from 'angular';
// import { module } from 'angular';
import { chain, clone, cloneDeep, extend, find, flatten, has, intersection, keys, map, some, xor } from 'lodash';

import {
  ACCOUNT_SERVICE,
  AccountService,
  CACHE_INITIALIZER_SERVICE,
  CacheInitializerService,
  IAccountDetails,
  IDeploymentStrategy,
  IRegion,
  ISecurityGroup,
  IServerGroupCommand,
  IServerGroupCommandBackingData,
  IServerGroupCommandBackingDataFiltered,
  IServerGroupCommandDirty,
  IServerGroupCommandResult,
  ISubnet,
  LOAD_BALANCER_READ_SERVICE,
  LoadBalancerReader,
  SECURITY_GROUP_READER,
  SecurityGroupReader,
  SERVER_GROUP_COMMAND_REGISTRY_PROVIDER,
  ServerGroupCommandRegistry,
  SUBNET_READ_SERVICE,
  SubnetReader,
} from '@spinnaker/core';

import { IAmazonLoadBalancer, IKeyPair } from 'amazon/domain';
import { KEY_PAIRS_READ_SERVICE, KeyPairsReader } from 'amazon/keyPairs/keyPairs.read.service';
import { IamRoleReader } from '../../iamRoles/iamRole.read.service';
import { IRoleDescriptor } from '../../iamRoles/IRole';

export type IBlockDeviceMappingSource = 'source' | 'ami' | 'default';

export interface IAmazonServerGroupCommandDirty extends IServerGroupCommandDirty {
  targetGroups?: string[];
}

export interface IAmazonServerGroupCommandResult extends IServerGroupCommandResult {
  dirty: IAmazonServerGroupCommandDirty;
}

export interface IAmazonServerGroupCommandBackingDataFiltered extends IServerGroupCommandBackingDataFiltered {
  keyPairs: string[];
  targetGroups: string[];
  iamRoles: string[];
}

export interface IAmazonServerGroupCommandBackingData extends IServerGroupCommandBackingData {
  filtered: IAmazonServerGroupCommandBackingDataFiltered;
  keyPairs: IKeyPair[];
  targetGroups: string[];
  iamRoles: IRoleDescriptor[];
}

export interface IAmazonServerGroupCommand extends IServerGroupCommand {
  backingData: IAmazonServerGroupCommandBackingData;
  copySourceCustomBlockDeviceMappings: boolean;
  ebsOptimized: boolean;
  healthCheckGracePeriod: number;
  instanceMonitoring: boolean;
  keyPair: string;
  spotPrice: string;
  targetHealthyDeployPercentage: number;
  useAmiBlockDeviceMappings: boolean;
  targetGroups: string[];

  getBlockDeviceMappingsSource: () => IBlockDeviceMappingSource;
  selectBlockDeviceMappingsSource: (selection: string) => void;
  usePreferredZonesChanged: () => IAmazonServerGroupCommandResult;
}

export class EcsServerGroupConfigurationService {
  private enabledMetrics = ['GroupMinSize', 'GroupMaxSize', 'GroupDesiredCapacity', 'GroupInServiceInstances', 'GroupPendingInstances', 'GroupStandbyInstances', 'GroupTerminatingInstances', 'GroupTotalInstances'];
  private healthCheckTypes = ['EC2', 'ELB'];
  private terminationPolicies = ['OldestInstance', 'NewestInstance', 'OldestLaunchConfiguration', 'ClosestToNextInstanceHour', 'Default'];

  constructor(private $q: IQService,
              private accountService: AccountService,
              private securityGroupReader: SecurityGroupReader,
              private awsInstanceTypeService: any,
              private cacheInitializer: CacheInitializerService,
              private subnetReader: SubnetReader,
              private keyPairsReader: KeyPairsReader,
              private loadBalancerReader: LoadBalancerReader,
              private serverGroupCommandRegistry: ServerGroupCommandRegistry,
              private autoScalingProcessService: any,
              private iamRoleReader: IamRoleReader,
              ) {
    'ngInject';
  }

  public configureUpdateCommand(command: IAmazonServerGroupCommand): void {
    console.log('bruno bruno bruno');

    command.backingData = {
      enabledMetrics: clone(this.enabledMetrics),
      healthCheckTypes: clone(this.healthCheckTypes),
      terminationPolicies: clone(this.terminationPolicies)
    } as IAmazonServerGroupCommandBackingData;
  }

  public configureCommand(command: IAmazonServerGroupCommand): IPromise<void> {
    this.applyOverrides('beforeConfiguration', command);

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

    command.getBlockDeviceMappingsSource = (): IBlockDeviceMappingSource  => {
      if (command.copySourceCustomBlockDeviceMappings) {
        return 'source';
      } else if (command.useAmiBlockDeviceMappings) {
        return 'ami';
      }
      return 'default';
    };

    command.selectBlockDeviceMappingsSource = (selection: string): void => {
      if (selection === 'source') {
        // copy block device mappings from source asg
        command.copySourceCustomBlockDeviceMappings = true;
        command.useAmiBlockDeviceMappings = false;
      } else if (selection === 'ami') {
        // use block device mappings from selected ami
        command.copySourceCustomBlockDeviceMappings = false;
        command.useAmiBlockDeviceMappings = true;
      } else {
        // use default block device mappings for selected instance type
        command.copySourceCustomBlockDeviceMappings = false;
        command.useAmiBlockDeviceMappings = false;
      }
    };

    command.regionIsDeprecated = (): boolean => {
      return has(command, 'backingData.filtered.regions') &&
        command.backingData.filtered.regions.some((region) => region.name === command.region && region.deprecated);
    };

    return this.$q.all({
      credentialsKeyedByAccount: this.accountService.getCredentialsKeyedByAccount('aws'),
      securityGroups: this.securityGroupReader.getAllSecurityGroups(),
      loadBalancers: this.loadBalancerReader.listLoadBalancers('aws'),
      subnets: this.subnetReader.listSubnets(),
      preferredZones: this.accountService.getPreferredZonesByAccount('aws'),
      keyPairs: this.keyPairsReader.listKeyPairs(),
      iamRoles: this.iamRoleReader.listRoles('ecs', 'continuous-delivery-ecs', 'us-west-2'),
      instanceTypes: this.awsInstanceTypeService.getAllTypesByRegion(),
      enabledMetrics: this.$q.when(clone(this.enabledMetrics)),
      healthCheckTypes: this.$q.when(clone(this.healthCheckTypes)),
      terminationPolicies: this.$q.when(clone(this.terminationPolicies)),
    }).then((backingData: Partial<IAmazonServerGroupCommandBackingData>) => {
      let loadBalancerReloader = this.$q.when(null);
      let securityGroupReloader = this.$q.when(null);
      backingData.accounts = keys(backingData.credentialsKeyedByAccount);
      backingData.filtered = {} as IAmazonServerGroupCommandBackingDataFiltered;
      backingData.scalingProcesses = this.autoScalingProcessService.listProcesses();
      command.backingData = backingData as IAmazonServerGroupCommandBackingData;
      console.log('Bruno look here');
      this.configureVpcId(command);
      backingData.filtered.securityGroups = this.getRegionalSecurityGroups(command);
      backingData.filtered.iamRoles = this.getTargetGroupNames(command);  // TODO(Bruno Carrier) - These strings should be a filter of IAM Roles, instead of some other dummy data

      if (command.loadBalancers && command.loadBalancers.length) {
        // verify all load balancers are accounted for; otherwise, try refreshing load balancers cache
        const loadBalancerNames = this.getLoadBalancerNames(command);
        if (intersection(loadBalancerNames, command.loadBalancers).length < command.loadBalancers.length) {
          loadBalancerReloader = this.refreshLoadBalancers(command, true);
        }
      }
      if (command.securityGroups && command.securityGroups.length) {
        const regionalSecurityGroupIds = map(this.getRegionalSecurityGroups(command), 'id');
        if (intersection(command.securityGroups, regionalSecurityGroupIds).length < command.securityGroups.length) {
          securityGroupReloader = this.refreshSecurityGroups(command, true);
        }
      }

      return this.$q.all([loadBalancerReloader, securityGroupReloader]).then(() => {
        this.applyOverrides('afterConfiguration', command);
        this.attachEventHandlers(command);
      });
    });
  }

  public applyOverrides(phase: string, command: IAmazonServerGroupCommand): void {
    this.serverGroupCommandRegistry.getCommandOverrides('aws').forEach((override: any) => {
      if (override[phase]) {
        override[phase](command);
      }
    });
  }


  public configureKeyPairs(command: IAmazonServerGroupCommand): IServerGroupCommandResult {
    const result: IAmazonServerGroupCommandResult = { dirty: {} };
    if (command.credentials && command.region) {
      // isDefault is imperfect, since we don't know what the previous account/region was, but probably a safe bet
      const isDefault = some<any>(command.backingData.credentialsKeyedByAccount, (c) => c.defaultKeyPair && command.keyPair && command.keyPair.indexOf(c.defaultKeyPair.replace('{{region}}', '')) === 0);
      const filtered = chain(command.backingData.keyPairs)
        .filter({account: command.credentials, region: command.region})
        .map('keyName')
        .value();
      if (command.keyPair && filtered.length && !filtered.includes(command.keyPair)) {
        const acct: IAccountDetails = command.backingData.credentialsKeyedByAccount[command.credentials] || {
            regions: [],
            defaultKeyPair: null
          } as IAccountDetails;
        if (acct.defaultKeyPair) {
          // {{region}} is the only supported substitution pattern
          const defaultKeyPair = acct.defaultKeyPair.replace('{{region}}', command.region);
          if (isDefault && filtered.includes(defaultKeyPair)) {
            command.keyPair = defaultKeyPair;
          } else {
            command.keyPair = null;
            result.dirty.keyPair = true;
          }
        } else {
          command.keyPair = null;
          result.dirty.keyPair = true;
        }
      }
      command.backingData.filtered.keyPairs = filtered;
    } else {
      command.backingData.filtered.keyPairs = [];
    }
    return result;
  }


  public configureAvailabilityZones(command: IAmazonServerGroupCommand): void {
    command.backingData.filtered.availabilityZones =
      find<IRegion>(command.backingData.credentialsKeyedByAccount[command.credentials].regions, {name: command.region}).availabilityZones;
  }

  public configureSubnetPurposes(command: IAmazonServerGroupCommand): IServerGroupCommandResult {
    const result: IAmazonServerGroupCommandResult = { dirty: {} };
    const filteredData = command.backingData.filtered;
    if (command.region === null) {
      return result;
    }
    filteredData.subnetPurposes = chain(command.backingData.subnets)
      .filter({account: command.credentials, region: command.region})
      .reject({target: 'elb'})
      .reject({purpose: null})
      .uniqBy('purpose')
      .value();

    if (!chain(filteredData.subnetPurposes).some({purpose: command.subnetType}).value()) {
      command.subnetType = null;
      result.dirty.subnetType = true;
    }
    return result;
  }

  public getRegionalSecurityGroups(command: IAmazonServerGroupCommand): ISecurityGroup[] {
    const newSecurityGroups = command.backingData.securityGroups[command.credentials] || { aws: {} };
    return chain(newSecurityGroups.aws[command.region])
      .filter({vpcId: command.vpcId || null})
      .sortBy('name')
      .value();
  }

  public configureSecurityGroupOptions(command: IAmazonServerGroupCommand): IServerGroupCommandResult {
    const result: IAmazonServerGroupCommandResult = { dirty: {} };
    const currentOptions: ISecurityGroup[] = command.backingData.filtered.securityGroups;
    const newRegionalSecurityGroups = this.getRegionalSecurityGroups(command);
    if (currentOptions && command.securityGroups) {
      // not initializing - we are actually changing groups
      const currentGroupNames = command.securityGroups.map((groupId) => {
        const match = find(currentOptions, {id: groupId});
        return match ? match.name : groupId;
      });

      const matchedGroups = command.securityGroups.map((groupId) => {
        const securityGroup = find(currentOptions, {id: groupId}) ||
          find(currentOptions, {name: groupId});
        return securityGroup ? securityGroup.name : null;
      })
      .map((groupName) => find(newRegionalSecurityGroups, {name: groupName}))
      .filter((group) => group);

      const matchedGroupNames = map(matchedGroups, 'name');
      const removed = xor(currentGroupNames, matchedGroupNames);
      command.securityGroups = map(matchedGroups, 'id');
      if (removed.length) {
        result.dirty.securityGroups = removed;
      }
    }
    command.backingData.filtered.securityGroups = newRegionalSecurityGroups.sort((a, b) => {
      if (command.securityGroups) {
        if (command.securityGroups.includes(a.id)) {
          return -1;
        }
        if (command.securityGroups.includes(b.id)) {
          return 1;
        }
      }
      return a.name.localeCompare(b.name);
    });
    return result;
  }

  public refreshSecurityGroups(command: IAmazonServerGroupCommand, skipCommandReconfiguration?: boolean): IPromise<void> {
    return this.cacheInitializer.refreshCache('securityGroups').then(() => {
      return this.securityGroupReader.getAllSecurityGroups().then((securityGroups) => {
        command.backingData.securityGroups = securityGroups;
        if (!skipCommandReconfiguration) {
          this.configureSecurityGroupOptions(command);
        }
      });
    });
  }

  private getLoadBalancerMap(command: IAmazonServerGroupCommand): IAmazonLoadBalancer[] {
    console.log('here target groups are loaded')
    // TODO(Bruno Carrier) - reenable commented lines, which will require handling accounts better
    // TODO(Bruno Carrier) - regions is null when I inspect it (before selecting region, I admit).
    return chain(command.backingData.loadBalancers)
      .map('accounts')
      .flattenDeep()
      // .filter({name: command.credentials})
      .map('regions')
      .flattenDeep()
      // .filter({name: command.region})
      .map<IAmazonLoadBalancer>('loadBalancers')
      .flattenDeep<IAmazonLoadBalancer>()
      .value()
  }

  public getLoadBalancerNames(command: IAmazonServerGroupCommand): string[] {
    // TODO(Bruno Carrier) - Investigate VPC filtering, which was removed when copying over the AWS script
    const loadBalancers = this.getLoadBalancerMap(command).filter((lb) => (!lb.loadBalancerType || lb.loadBalancerType === 'classic') );
    return loadBalancers.map((lb) => lb.name).sort();
  }

  public getVpcLoadBalancerNames(command: IAmazonServerGroupCommand): string[] {
    // TODO(Bruno Carrier) - Investigate VPC filtering, which was removed when copying over the AWS script
    const loadBalancersForVpc = this.getLoadBalancerMap(command).filter((lb) => (!lb.loadBalancerType || lb.loadBalancerType === 'classic') );
    return loadBalancersForVpc.map((lb) => lb.name).sort();
  }

  public getTargetGroupNames(command: IAmazonServerGroupCommand): string[] {
    console.log('yolo so do it right!');
    const loadBalancersV2 = this.getLoadBalancerMap(command).filter((lb) => lb.loadBalancerType !== 'classic') as any[];
    const allTargetGroups = flatten(loadBalancersV2.map<string[]>((lb) => lb.targetGroups));
    return allTargetGroups.sort();
  }

  public configureLoadBalancerOptions(command: IAmazonServerGroupCommand): IServerGroupCommandResult {
    const result: IAmazonServerGroupCommandResult = { dirty: {} };
    const currentLoadBalancers = (command.loadBalancers || []).concat(command.vpcLoadBalancers || []);
    const currentTargetGroups = command.targetGroups || [];
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

    if (currentTargetGroups && command.targetGroups) {
      const matched = intersection(allTargetGroups, currentTargetGroups);
      const removedTargetGroups = xor(matched, currentTargetGroups);
      command.targetGroups = intersection(allTargetGroups, matched);
      if (removedTargetGroups.length) {
        result.dirty.targetGroups = removedTargetGroups;
      }
    }

    command.backingData.filtered.loadBalancers = newLoadBalancers;
    command.backingData.filtered.vpcLoadBalancers = vpcLoadBalancers;
    command.backingData.filtered.targetGroups = allTargetGroups;
    return result;
  }

  public refreshLoadBalancers(command: IAmazonServerGroupCommand, skipCommandReconfiguration?: boolean) {
    return this.cacheInitializer.refreshCache('loadBalancers').then(() => {
      return this.loadBalancerReader.listLoadBalancers('aws').then((loadBalancers) => {
        command.backingData.loadBalancers = loadBalancers;
        if (!skipCommandReconfiguration) {
          this.configureLoadBalancerOptions(command);
        }
      });
    });
  }

    public configureVpcId(command: IAmazonServerGroupCommand): IAmazonServerGroupCommandResult {
      const result: IAmazonServerGroupCommandResult = { dirty: {} };
      if (!command.subnetType) {
        command.vpcId = null;
        result.dirty.vpcId = true;
      } else {
        const subnet = find<ISubnet>(command.backingData.subnets, {purpose: command.subnetType, account: command.credentials, region: command.region});
        command.vpcId = subnet ? subnet.vpcId : null;
      }
      return result;
    }

    public attachEventHandlers(command: IAmazonServerGroupCommand): void {
      command.usePreferredZonesChanged = (): IAmazonServerGroupCommandResult => {
        const currentZoneCount = command.availabilityZones ? command.availabilityZones.length : 0;
        const result: IAmazonServerGroupCommandResult = { dirty: {} };
        const preferredZonesForAccount = command.backingData.preferredZones[command.credentials];
        if (preferredZonesForAccount && preferredZonesForAccount[command.region] && command.viewState.usePreferredZones) {
          command.availabilityZones = cloneDeep(preferredZonesForAccount[command.region].sort());
        } else {
          command.availabilityZones = intersection(command.availabilityZones, command.backingData.filtered.availabilityZones);
          const newZoneCount = command.availabilityZones ? command.availabilityZones.length : 0;
          if (currentZoneCount !== newZoneCount) {
            result.dirty.availabilityZones = true;
          }
        }
        return result;
      };

      command.subnetChanged = (): IServerGroupCommandResult => {
        const result = this.configureVpcId(command);
        extend(result.dirty, this.configureSecurityGroupOptions(command).dirty);
        extend(result.dirty, this.configureLoadBalancerOptions(command).dirty);
        command.viewState.dirty = command.viewState.dirty || {};
        extend(command.viewState.dirty, result.dirty);
        return result;
      };

      command.regionChanged = (): IServerGroupCommandResult => {
        const result: IAmazonServerGroupCommandResult = { dirty: {} };
        const filteredData = command.backingData.filtered;
        extend(result.dirty, this.configureSubnetPurposes(command).dirty);
        if (command.region) {
          extend(result.dirty, command.subnetChanged().dirty);

          this.configureAvailabilityZones(command);
          extend(result.dirty, command.usePreferredZonesChanged().dirty);

          extend(result.dirty, this.configureKeyPairs(command).dirty);
        } else {
          filteredData.regionalAvailabilityZones = null;
        }

        return result;
      };

      command.credentialsChanged = (): IServerGroupCommandResult => {
        const result: IAmazonServerGroupCommandResult = { dirty: {} };
        const backingData = command.backingData;
        if (command.credentials) {
          const regionsForAccount: IAccountDetails = backingData.credentialsKeyedByAccount[command.credentials] || {regions: [], defaultKeyPair: null} as IAccountDetails;
          backingData.filtered.regions = regionsForAccount.regions;
          if (!some(backingData.filtered.regions, {name: command.region})) {
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


      command.instanceTypeChanged = (): void => {
        command.ebsOptimized = this.awsInstanceTypeService.isEbsOptimized(command.instanceType);
      };

      this.applyOverrides('attachEventHandlers', command);
    }

}

export const ECS_SERVER_GROUP_CONFIGURATION_SERVICE = 'spinnaker.amazon.serverGroup.configure.service';
module(ECS_SERVER_GROUP_CONFIGURATION_SERVICE, [
  ACCOUNT_SERVICE,
  SECURITY_GROUP_READER,
  SUBNET_READ_SERVICE,
  require('../../../amazon/src/instance/awsInstanceType.service.js'),
  KEY_PAIRS_READ_SERVICE,
  LOAD_BALANCER_READ_SERVICE,
  CACHE_INITIALIZER_SERVICE,
  SERVER_GROUP_COMMAND_REGISTRY_PROVIDER,
  require('../../../amazon/src/serverGroup/details/scalingProcesses/autoScalingProcess.service.js'),
])
  .service('ecsServerGroupConfigurationService', EcsServerGroupConfigurationService);
