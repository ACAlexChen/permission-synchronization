import { Context, Schema } from 'koishi'
import {} from 'koishi-plugin-cron'

export const name = 'permission-synchronization'

export const inject = {
  required: [
    'cron',
    'database'
  ],
}

export interface Config {}

export const Config: Schema<Config> = Schema.intersect([]) as Schema<Config>

export function apply(ctx: Context, cfg: Config) {
  async function RoleSynchronization (time: string, TargetPlatform: string, TargetBotID: string, TargetGuildID: string, OriginalPlatform: string, OriginalBotID: string, OriginalGuildID: string, roleID: string) {
    ctx.cron(time, async() => {
      let TargetGuildMemberIDList = (await ctx.bots[`${TargetPlatform}:${TargetBotID}`].getGuildMemberList(TargetGuildID)).data.map(member => member.user.id)
      let OriginalGuildMemberIDList = (await ctx.bots[`${OriginalPlatform}:${OriginalBotID}`].getGuildMemberList(OriginalGuildID)).data.map(member => member.user.id)
      for (let i = 0; i < TargetGuildMemberIDList.length; i++) {  
        let TargetGuildMember_AT_OriginalGuild_MemberID = await ctx.database.get('binding',{
          'pid': TargetGuildMemberIDList[i],
          'platform': TargetPlatform,
        },['aid'])
        let OriginalGuildMember_AT_TargetGuild_MemberID = await ctx.database.get('binding',{
          'aid': TargetGuildMember_AT_OriginalGuild_MemberID[0].aid,
          'platform': OriginalPlatform,
        },['pid'])
        if (OriginalGuildMemberIDList.includes(OriginalGuildMember_AT_TargetGuild_MemberID[0].pid)){
          ctx.bots[`${TargetPlatform}:${TargetBotID}`].setGuildMemberRole(TargetGuildID, TargetGuildMemberIDList[i], roleID)
        }
      }
    })
  }
}
