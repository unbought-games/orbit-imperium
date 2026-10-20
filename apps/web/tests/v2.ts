import type {APIRequestContext} from '@playwright/test'
import {randomUUID} from 'node:crypto'
export async function overview(api:APIRequestContext) {
 const session=await(await api.get('/api/v1/session')).json(),u=session.memberships[0].universe
 const candidate=await(await api.get(`/api/v2/universes/${u}/binding?request_id=${randomUUID()}`)).json()
 const response=await api.post(`/api/v2/universes/${u}/overview`,{headers:{Origin:process.env.ORBIT_TEST_BASE_URL??'http://localhost:18080','X-CSRF-Token':session.csrf},data:{binding:candidate.binding,request_id:randomUUID()}})
 if(!response.ok())throw Error('Overview unavailable')
 return response.json()
}
