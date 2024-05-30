import { Context, Schema } from 'koishi'
import {} from 'koishi-plugin-cron'

export const name = 'permission-synchronization'

export const inject = {
  required: [
    'cron',
    'database',
    '@koishijs/plugin-bind'
  ],
}

export interface Config {}

export const Config: Schema<Config> = Schema.intersect([]) as Schema<Config>

export function apply(ctx: Context) {
  async function PermissionSynchronization (time: string, TargetPlatform: string, TargetBotID: string, TargetGuildID: string, OriginalPlatform: string, OriginalBotID: string, OriginalGuildID: string, roleID: string) {
    ctx.cron(time, async() => {
      let TargetGuildMemberIDList = (await ctx.bots[`${TargetPlatform}:${TargetBotID}`].getGuildMemberList(TargetGuildID)).data.map(member => member.user.id)
      let OriginalGuildMemberIDList = (await ctx.bots[`${OriginalPlatform}:${OriginalBotID}`].getGuildMemberList(OriginalGuildID)).data.map(member => member.user.id)
      for (let i = 0; i < TargetGuildMemberIDList.length; i++) {  
        var TargetGuildMember_AT_OriginalGuild_MemberIDList = await ctx.database.get('binding',{
          'pid': TargetGuildMemberIDList[i],
          'platform': TargetPlatform,
        },['aid','pid'])
      }
      for (let i = 0; i < TargetGuildMember_AT_OriginalGuild_MemberIDList.length; i++){
        var OriginalGuildMember_AI_TargetGuild_MemberIDList = await ctx.database.get('binding',{
          'aid': TargetGuildMember_AT_OriginalGuild_MemberIDList[i].aid,
          'platform': OriginalPlatform,
        },['aid','pid'])
      }
      for (let i = 0; i < OriginalGuildMember_AI_TargetGuild_MemberIDList.length; i++){
        if (OriginalGuildMemberIDList.includes(OriginalGuildMember_AI_TargetGuild_MemberIDList[i].pid)){
          await ctx.bots[`${TargetPlatform}:${TargetBotID}`].setGuildMemberRole(TargetBotID,TargetGuildMember_AT_OriginalGuild_MemberIDList.find(member => member.aid === OriginalGuildMember_AI_TargetGuild_MemberIDList[i].aid).pid,roleID)
        }
      }
    })
  }
}
