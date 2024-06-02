import { Context, Schema } from 'koishi'
import {} from 'koishi-plugin-cron'

export const name = 'permission-synchronization'

export const inject = {
  required: [
    'cron',
    'database'
  ],
}

export interface Config {
  Original_Target: {
    time: string
    TargetPlatform: string
    TargetBotID: string
    TargetGuildID: string
    OriginalPlatform: string
    OriginalBotID: string
    OriginalGuildID: string
    roleID: string
  }[]
}

export const Config: Schema<Config> = Schema.object({
  Original_Target: Schema.array(Schema.object({
    time: Schema.string().description('执行时间（cron表达式）').default('30 * * * *').required(),
    TargetPlatform: Schema.string().description('目标平台').required(),
    TargetBotID: Schema.string().description('目标机器人ID').required(),
    TargetGuildID: Schema.string().description('目标频道ID').required(),
    OriginalPlatform: Schema.string().description('原平台').required(),
    OriginalBotID: Schema.string().description('原机器人ID').required(),
    OriginalGuildID: Schema.string().description('原频道ID').required(),
    roleID: Schema.string().description('需要同步的身份组ID').required(),
  })).role('table'),
}) as Schema<Config>

export function apply(ctx: Context, cfg: Config) {
  async function RoleSynchronization (time: string, TargetPlatform: string, TargetBotID: string, TargetGuildID: string, OriginalPlatform: string, OriginalBotID: string, OriginalGuildID: string, roleID: string) {
    ctx.cron(time, async() => {
      let TargetGuildMemberIDList = (await ctx.bots[`${TargetPlatform}:${TargetBotID}`].getGuildMemberList(TargetGuildID)).data.map(member => member.user.id)
      let OriginalGuildMemberIDList = (await ctx.bots[`${OriginalPlatform}:${OriginalBotID}`].getGuildMemberList(OriginalGuildID)).data.map(member => member.user.id)
      for (let i = 0; i < TargetGuildMemberIDList.length; i++) {  
        try {
          let TargetGuildMember_AT_OriginalGuild_MemberID = await ctx.database.get('binding',{
            'pid': TargetGuildMemberIDList[i],
            'platform': TargetPlatform,
          },['aid'])
          var OriginalGuildMember_AT_TargetGuild_MemberID = await ctx.database.get('binding',{
            'aid': TargetGuildMember_AT_OriginalGuild_MemberID[0].aid,
            'platform': OriginalPlatform,
          },['pid'])
        } finally {
          if (!OriginalGuildMember_AT_TargetGuild_MemberID){
            await ctx.bots[`${TargetPlatform}:${TargetBotID}`].unsetGuildMemberRole(TargetGuildID, TargetGuildMemberIDList[i], roleID)
          } else if (OriginalGuildMemberIDList.includes(OriginalGuildMember_AT_TargetGuild_MemberID[0].pid)){
            await ctx.bots[`${TargetPlatform}:${TargetBotID}`].setGuildMemberRole(TargetGuildID, TargetGuildMemberIDList[i], roleID)
          } else {
            await ctx.bots[`${TargetPlatform}:${TargetBotID}`].unsetGuildMemberRole(TargetGuildID, TargetGuildMemberIDList[i], roleID)
          }
        }
      }
    })
  }





  for (let i = 0; i < cfg.Original_Target.length; i++) {
    let item = cfg.Original_Target[i]
    RoleSynchronization(
      item.time, 
      item.TargetPlatform, 
      item.TargetBotID, 
      item.TargetGuildID, 
      item.OriginalPlatform, 
      item.OriginalBotID, 
      item.OriginalGuildID, 
      item.roleID
    )
  }



}
