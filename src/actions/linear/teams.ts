import { defineAction } from '../../core/action';
import { type LinearTeam, linearAuth, listLinearTeams } from './common';

/** Public type — stable across the AP→ours upgrade. */
export const LIST_TEAMS_TYPE = 'linear.list_teams';

/**
 * List every team in the workspace. Read-only and the benign live-smoke action
 * for Linear — it also underpins the team picker used by the issue actions.
 */
export const listTeams = defineAction({
  type: LIST_TEAMS_TYPE,
  name: 'List teams',
  description: 'List the teams in the connected Linear workspace.',
  auth: linearAuth,
  props: {},
  async run({ auth, http }): Promise<{ teams: LinearTeam[]; count: number }> {
    const teams = await listLinearTeams(http, auth);
    return { teams, count: teams.length };
  },
});
