import { Context, Schema } from 'koishi'
import {} from 'koishi-plugin-cron'
import {} from 'koishi-plugin-binding-id-converter'


export const name = 'permission-synchronization'

export const inject = {
  required: [
    'cron',
    'database',
    'idconverter'
  ],
}

export interface Config {
  syncTime: string
}

export const Config: Schema<Config> = Schema.object({

  syncTime: Schema.string().description('同步时间，格式为 cron 表达式，例如：0 * * * * 表示每小时 0 分同步').default('0 * * * *'),

}) as Schema<Config>

declare module 'koishi' {

  interface Tables {
    permissionSynchronizationSig: Tables.permissionSynchronizationSig
    permissionSynchronizationToBeAccepted: Tables.permissionSynchronizationToBeAccepted
  }
  /* eslint-disable */
  namespace Tables {
    interface array {
      main: []
    }

    interface botsP {
      id: string
      platform: string
      botId: string
    }

    interface arrayBotsP {
      main: botsP[]
    }

    interface botsR {
      id: string
      guildId: string
      botId: string
      platform: string
    }

    interface arrayBotsR {
      main: botsR[]
    }

    interface permissionSynchronizationSig {
      id: number
      name: string
      members: string[]
      admins: string[]
      roles: arrayBotsR
      groups: arrayBotsP
      depend: array
      inherit: array
      invitationSystem: boolean
      publicitySystem: boolean
      all: number
    }

    interface permissionSynchronizationToBeAccepted {
      id: number
      userAid: string
      sigName: string
      invited: boolean
      all: number
    }
  }
  /* eslint-enable */
}


export function apply(ctx: Context, cfg: Config) {

  ctx.model.extend('permissionSynchronizationSig', {
    id: 'unsigned',
    name: 'string',
    members: 'array',
    admins: 'array',
    roles: 'json',
    groups: 'json',
    depend: 'json',
    inherit: 'json',
    invitationSystem: 'boolean',
    publicitySystem: 'boolean',
    all: 'unsigned'
  },{primary: ['id'],unique: ['id','name']})
  ctx.model.extend('permissionSynchronizationToBeAccepted', {
    id: 'unsigned',
    userAid:'string',
    sigName:'string',
    invited: 'boolean',
    all: 'unsigned'
  },{primary:['id'],unique:['id']})

  ctx.on('ready', async () => {
    const database = await ctx.database.get('permissionSynchronizationSig',{id: 0, name: 'psaAdminSig'})
    if (database.length === 0){
      await ctx.database.upsert('permissionSynchronizationSig',[{
        id: 0,
        name: 'psaAdminSig',
        members: [],
        admins: [],
        roles: {main: []},
        groups: {main: []},
        depend: {main: []},
        inherit: {main: []},
        invitationSystem: true,
        publicitySystem: false,
        all: 0
      }])
    }
  })

  ctx.command('permission-synchronization.addAdmin <user>', {authority: 5}).alias('psa.addAdmin').alias('psa.添加管理员')
  .action(async ({session}, user) => {
    const userId = user.match(/<at id="(\d+)"\s*\/>/)[1]
    if (!userId) {
      return '请@正确的用户'
    } else {
      const nowSigMembers = (await ctx.database.get('permissionSynchronizationSig', {id: 0}))[0].members
      nowSigMembers.push(`${await ctx.idconverter.getUserAid(userId, session.platform)}`)
      await ctx.database.set('permissionSynchronizationSig', {id: 0}, {members: nowSigMembers})
      return '添加成功'
    }
  })

  ctx.command('permission-synchronization.addSig').alias('psa.addSig').alias('psa.创建小组')
  .option('name', '-n <name>')
  .option('invitationSystem', '-i', {fallback: false})
  .option('publicitySystem', '-p', {fallback: false})
  .action(async ({session, options}, name) => {
    if (!options.name) {
      return '请输入小组名称'
    } else {
      if (options.invitationSystem && options.publicitySystem){
        return '该小组不能同时开启邀请制和公开制'
      }
      const pass = await ctx.database.get('permissionSynchronizationSig', {name: name})
      if (pass.length > 0){
        return '小组已存在'
      } else {
        const allSig = await ctx.database.get('permissionSynchronizationSig',{all: 0})
        let maxId
        if (allSig.length === 0){
          maxId = 0
        } else {
          const ids = allSig.map(i => i.id)
          maxId = Math.max(...ids)
        }
        await ctx.database.create('permissionSynchronizationSig', {
          id: maxId + 1,
          name: options.name,
          members: [`${await ctx.idconverter.getUserAid(session.userId, session.platform)}`],
          admins: [`${await ctx.idconverter.getUserAid(session.userId, session.platform)}`],
          roles: {main: []},
          groups: {main: []},
          invitationSystem: options.invitationSystem,
          publicitySystem: options.publicitySystem,
          all: 0
        })
        ctx.logger.info(options)
        return '创建成功'
      }
    }
  })

  ctx.command('permission-synchronization.addSigAdmin').alias('psa.addSigAdmin').alias('psa.添加小组管理员')
  .option('user', '-u <user>')
  .option('sig', '-s <sig>')
  .action(async ({session, options}) => {
    if (!options.user ||!options.sig){
      return '请@正确的用户和输入正确的小组名称'
    } else {
      const sessionUserId = await ctx.idconverter.getUserAid(session.userId, session.platform)
      const Admin = await ctx.database.get('permissionSynchronizationSig', {id: 0}, ['members'])[0].members
      if (!Admin.includes(sessionUserId)){
        return '你无权执行此操作'
      } else {
        const userId = options.user.match(/<at id="(\d+)"\s*\/>/)[1]
        const userAid = await ctx.idconverter.getUserAid(userId, session.platform)
        const nowSig = await ctx.database.get('permissionSynchronizationSig', {name: options.sig})
        if (nowSig.length === 0){
          return '小组不存在'
        } else {
          const nowAdmins = nowSig[0].admins
          if (nowAdmins.includes(`${userAid}`)){
            return '用户已是小组管理员'
          } else if (!nowSig[0].members.includes(`${userAid}`)){
            return '用户不在小组成员列表中'
          } else {
            nowAdmins.push(`${userAid}`)
            await ctx.database.set('permissionSynchronizationSig', {name: options.sig}, {admins: nowAdmins})
            return '添加成功'
          }
        }
      }
    }
  })

  ctx.command('permission-synchronization.joinSig <name>').alias('psa.joinSig').alias('psa.加入小组')
  .action(async ({session}, name) => {
    if (!name){
      return '请输入小组名称'
    } else {
      const nowSig = await ctx.database.get('permissionSynchronizationSig', {name: name})
      if (nowSig.length === 0){
        return '小组不存在'
      } else if (nowSig[0].members.includes(`${await ctx.idconverter.getUserAid(session.userId, session.platform)}`)){
        return '你已经在小组中'
      } else if (nowSig[0].invitationSystem === false){
        return '该小组不接受主动加入'
      } else if (nowSig[0].publicitySystem){
        const nowMembers = nowSig[0].members
        nowMembers.push(`${await ctx.idconverter.getUserAid(session.userId, session.platform)}`)
        await ctx.database.set('permissionSynchronizationSig', {name: name}, {members: nowMembers})
        return '加入成功'
      } else {
        const nowJ = await ctx.database.get('permissionSynchronizationToBeAccepted', {userAid: `${await ctx.idconverter.getUserAid(session.userId, session.platform)}`, sigName: name, invited: false})
        if (nowJ.length !== 0){
          return '你已经发送过邀请，请等待管理员同意'
        }
        const nowI = await ctx.database.get('permissionSynchronizationToBeAccepted', {userAid: `${await ctx.idconverter.getUserAid(session.userId, session.platform)}`, sigName: name, invited: true})
        if (nowI.length !== 0){
          return '你已经被邀请加入该小组'
        }
        const allSig = await ctx.database.get('permissionSynchronizationSig',{all: 0})
        let maxId
        if (allSig.length === 0){
          maxId = 0
        } else {
          const ids = allSig.map(i => i.id)
          maxId = Math.max(...ids)
        }
        await ctx.database.create('permissionSynchronizationToBeAccepted', {
          id: maxId + 1,
          userAid: `${await ctx.idconverter.getUserAid(session.userId, session.platform)}`,
          sigName: name,
          invited: false,
          all: 0
        })
        return `已发送邀请，请等待管理员同意`
      }
    }
  })

  ctx.command('permission-synchronization.view.mySig').alias('psa.view.mySig').alias('psa.查看.我加入的小组')
  .action(async ({session}) => {
    const allSig = await ctx.database.get('permissionSynchronizationSig',{all: 0})
    if (allSig.length === 0){
      return '你还没有加入任何小组'
    }
    const joinSig = await allSig.filter(async (sig) => sig.members.includes(`${await ctx.idconverter.getUserAid(session.userId, session.platform)}`))
    const adminSig = await allSig.filter(async (sig) => sig.admins.includes(`${await ctx.idconverter.getUserAid(session.userId, session.platform)}`))
    return `你加入的小组：&#10;${joinSig.map((sig) => sig.name).join('&#10;')}&#10;---&#10;你管理的小组：&#10;${adminSig.map((sig) => sig.name).join('&#10;')}`
  })

  ctx.command('permission-synchronization.view.allSig').alias('psa.view.allSig').alias('psa.查看.所有小组')
  .action(async () => {
    const allSig = await ctx.database.get('permissionSynchronizationSig',{all: 0})
    const publicitySig = allSig.filter((sig) => sig.publicitySystem)
    const invitationSig = allSig.filter((sig) => sig.invitationSystem)
    const applySig = allSig.filter((sig) => sig.invitationSystem === false && sig.publicitySystem === false)
    return `公开制小组：&#10;${publicitySig.map((sig) => sig.name).join('&#10;')}&#10;---&#10;邀请制小组：&#10;${invitationSig.map((sig) => sig.name).join('&#10;')}&#10;---&#10;申请制小组：&#10;${applySig.map((sig) => sig.name).join('&#10;')}`
  })

  ctx.command('permission-synchronization.view.myInvitations').alias('psa.view.myInvitations').alias('psa.查看.我的邀请')
  .action(async ({session}) => {
    const allInvitations = await ctx.database.get('permissionSynchronizationToBeAccepted',{userAid: `${await ctx.idconverter.getUserAid(session.userId, session.platform)}`})
    if (allInvitations.length === 0){
      return '你还没有任何邀请'
    }
    const invited = allInvitations.filter((invitation) => invitation.invited)
    const invit = allInvitations.filter((invitation) => invitation.invited === false)
    return `你发送的申请：&#10;${invit.map((invitation) => invitation.sigName).join('&#10;')}&#10;---&#10;邀请你加入的小组：&#10;${invited.map((invitation) => invitation.sigName).join('&#10;')}`
  }) // TODO

  ctx.command('permission-synchronization.view.sigInvitation <name>').alias('psa.view.sigInvitation').alias('psa.查看.小组邀请')
  .action(async ({session}, name) => {
    if (!name){
      return '请输入小组名称'
    }
    const sigInfo = await ctx.database.get('permissionSynchronizationSig', {name: name})
    if (sigInfo.length === 0){
      return '小组不存在'
    }else if (!sigInfo[0].admins.includes(`${await ctx.idconverter.getUserAid(session.userId, session.platform)}`)){
      return '你无权查看该小组的邀请'
    }
    const sigInvitation = await ctx.database.get('permissionSynchronizationToBeAccepted', {sigName: name, invited: false})
    if (sigInvitation.length === 0){
      return '该小组暂无邀请'
    } else {
      const invitMembers = []
      const invitMembersAid = sigInvitation.map((invitation) => invitation.userAid)
      for (let i = 0; i < invitMembersAid.length; i++){
        const user = await ctx.idconverter.getUserPid(Number(invitMembersAid[i]), session.platform)
        if (user){
          invitMembers.push(user)
        }
      }
      if (invitMembers.length !== 0){
        return `申请加入的成员：&#10;${invitMembers.join('&#10;')}`
      } else {
        return '该小组暂无申请'
      }
    }
  })

  ctx.command('permission-synchronization.acceptInvitation').alias('psa.acceptInvitation').alias('psa.接受邀请/申请')
  .option('sig', '-s <sig>')
  .option('user', '-u [user]')
  .action(async ({session, options}) => {
    const sigInfo = await ctx.database.get('permissionSynchronizationSig', {name: options.sig})
    if (sigInfo.length === 0){
      return '小组不存在'
    }
    const sigInvitation = await ctx.database.get('permissionSynchronizationToBeAccepted', {sigName: options.sig, userAid: `${await ctx.idconverter.getUserAid(options.user, session.platform)}`})
    if (sigInvitation.length === 0){
      return '该用户没有邀请/申请'
    }
    if (sigInvitation[0].invited){
      if (sigInvitation[0].userAid === `${await ctx.idconverter.getUserAid(session.userId, session.platform)}`){
        const nowMembers = sigInfo[0].members
        nowMembers.push(`${await ctx.idconverter.getUserAid(session.userId, session.platform)}`)
        await ctx.database.set('permissionSynchronizationSig', {name: options.sig}, {members: nowMembers})
        await ctx.database.remove('permissionSynchronizationToBeAccepted', {sigName: options.sig, userAid: `${await ctx.idconverter.getUserAid(options.user, session.platform)}`})
        return '加入成功'
      } else {
        return '你无权接受该邀请'
      }
    } else {
      if (sigInfo[0].admins.includes(`${await ctx.idconverter.getUserAid(session.userId, session.platform)}`)){
        const nowMembers = sigInfo[0].members
        nowMembers.push(`${await ctx.idconverter.getUserAid(options.user, session.platform)}`)
        await ctx.database.set('permissionSynchronizationSig', {name: options.sig}, {members: nowMembers})
        await ctx.database.remove('permissionSynchronizationToBeAccepted', {sigName: options.sig, userAid: `${await ctx.idconverter.getUserAid(options.user, session.platform)}`})
        return '加入成功'
      } else {
        return '你无权接受该申请'
      }
    }
  })

  ctx.command('permission-synchronization.inviteUser').alias('psa.inviteUser').alias('psa.邀请用户')
  .option('user', '-u <user>')
  .option('sig', '-s <sig>')
  .action(async ({session, options}) => {
    const sigInfo = await ctx.database.get('permissionSynchronizationSig', {name: options.sig})
    if (sigInfo.length === 0){
      return '小组不存在'
    }
    if (!sigInfo[0].admins.includes(`${await ctx.idconverter.getUserAid(session.userId, session.platform)}`)){
      return '你无权邀请用户'
    }
    const sigInvitation = await ctx.database.get('permissionSynchronizationToBeAccepted', {sigName: options.sig, userAid: `${await ctx.idconverter.getUserAid(options.user, session.platform)}`})
    if (sigInvitation.length !== 0){
      return '该用户已经被邀请/申请加入'
    }
    if (sigInfo[0].members.includes(`${await ctx.idconverter.getUserAid(options.user, session.platform)}`)){
      return '该用户已经在小组中'
    }
    if (sigInfo[0].publicitySystem){
      return '该小组为公开小组'
    }
    const allInvitations = await ctx.database.get('permissionSynchronizationToBeAccepted',{all: 0})
    let maxId
    if (allInvitations.length === 0){
      maxId = 0
    } else {
      const ids = allInvitations.map(i => i.id)
      maxId = Math.max(...ids)
    }
    await ctx.database.create('permissionSynchronizationToBeAccepted', {
      id: maxId + 1,
      userAid: `${await ctx.idconverter.getUserAid(options.user, session.platform)}`,
      sigName: options.sig,
      invited: true
    })
    return '邀请成功'
  })

  ctx.cron(cfg.syncTime, async () => {
    const allSig = await ctx.database.get('permissionSynchronizationSig',{all: 0})
    for (let i = 0; i < allSig.length; i++){
      for (let g = 0; g < allSig[i].groups.main.length; g++){
        const groupMembers = (await ctx.bots[`${allSig[i].groups.main[g].platform}:${allSig[i].groups.main[g].botId}`].getGuildMemberList(allSig[i].groups.main[g].id)).data
        const groupMembersId = groupMembers.map(member => member.user.id)
        for (let u = 0; u < groupMembersId.length; u++){
          try {
            const userAid = await ctx.idconverter.getUserAid(groupMembersId[u], allSig[i].groups.main[g].platform)
            if (!allSig[i].members.includes(`${userAid}`)){
              await ctx.bots[`${allSig[i].groups.main[g].platform}:${allSig[i].groups.main[g].botId}`].kickGuildMember(allSig[i].groups.main[g].id, groupMembersId[u])
            }
          } catch (e) {
            await ctx.bots[`${allSig[i].groups.main[g].platform}:${allSig[i].groups.main[g].botId}`].kickGuildMember(allSig[i].groups.main[g].id, groupMembersId[u])
          }
        }
      }
      for (let r = 0; r < allSig[i].roles.main.length; r++){
        const groupMembers = (await ctx.bots[`${allSig[i].roles.main[r].platform}:${allSig[i].roles.main[r].botId}`].getGuildMemberList(allSig[i].roles.main[r].guildId)).data
        const groupMembersId = groupMembers.map(member => member.user.id)
        for (let u = 0; u < groupMembersId.length; u++){
          try {
            const userAid = await ctx.idconverter.getUserAid(groupMembersId[u], allSig[i].roles.main[r].platform)
            if (!allSig[i].members.includes(`${userAid}`)){
              await ctx.bots[`${allSig[i].roles.main[r].platform}:${allSig[i].roles.main[r].botId}`].unsetGuildMemberRole(allSig[i].roles.main[r].guildId, groupMembersId[u], allSig[i].roles.main[r].id)
            } else {
              await ctx.bots[`${allSig[i].roles.main[r].platform}:${allSig[i].roles.main[r].botId}`].setGuildMemberRole(allSig[i].roles.main[r].guildId, groupMembersId[u], allSig[i].roles.main[r].id)
            }
          } catch (e) {
            await ctx.bots[`${allSig[i].roles.main[r].platform}:${allSig[i].roles.main[r].botId}`].unsetGuildMemberRole(allSig[i].roles.main[r].guildId, groupMembersId[u], allSig[i].roles.main[r].id)
          }
        }
      }
    }
  })

  ctx.command('permission-synchronization.addThisGroup <sigName>').alias('psa.addThisGroup').alias('psa.添加本群')
  .action(async ({session}, sigName) => {
    const sigInfo = await ctx.database.get('permissionSynchronizationSig', {name: sigName})
    if (sigInfo.length === 0){
      return '小组不存在'
    }
    if (!sigInfo[0].admins.includes(`${await ctx.idconverter.getUserAid(session.userId, session.platform)}`)){
      return '你无权添加本群'
    }
    const nowGroups = sigInfo[0].groups.main
    const nowGroupFind = nowGroups.find(group => group.platform === session.platform && group.id === session.guildId)
    if (nowGroupFind){
      return '本群已经添加过'
    } else {
      nowGroups.push({
        id: session.guildId,
        platform: session.platform,
        botId: session.selfId
      })
      return '添加成功'
    }
  })

  ctx.command('permission-synchronization.removeThisGroup <sigName>').alias('psa.removeThisGroup').alias('psa.移除本群')
  .action(async ({session}, sigName) => {
    const sigInfo = await ctx.database.get('permissionSynchronizationSig', {name: sigName})
    if (sigInfo.length === 0){
      return '小组不存在'
    }
    if (!sigInfo[0].admins.includes(`${await ctx.idconverter.getUserAid(session.userId, session.platform)}`)){
      return '你无权移除本群'
    }
    const nowGroups = sigInfo[0].groups.main
    const nowGroupFind = nowGroups.find(group => group.platform === session.platform && group.id === session.guildId)
    if (nowGroupFind){
      nowGroups.splice(nowGroups.indexOf(nowGroupFind), 1)
      return '移除成功'
    } else {
      return '本群没有添加过'
    }
  })

}
