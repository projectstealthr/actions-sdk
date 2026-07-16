import { FakeTransport, stubAuth } from '../../testing/fakes';
import { convertJsonToText, convertTextToJson, jsonActions, mergeJson } from './index';

const noAuth = stubAuth(new FakeTransport(() => ({ status: 200, headers: {}, data: {} })));

describe('json actions', () => {
  it('serialises a value to text, pretty and compact', async () => {
    expect(await convertJsonToText.execute({ auth: noAuth, props: { data: { a: 1 } } })).toEqual({
      result: '{"a":1}',
    });
    const pretty = await convertJsonToText.execute({ auth: noAuth, props: { data: { a: 1 }, pretty: true } });
    expect(pretty.result).toBe('{\n  "a": 1\n}');
  });

  it('parses valid JSON and rejects invalid JSON', async () => {
    expect(await convertTextToJson.execute({ auth: noAuth, props: { text: '[1,2,3]' } })).toEqual({
      result: [1, 2, 3],
    });
    await expect(convertTextToJson.execute({ auth: noAuth, props: { text: '{bad}' } })).rejects.toMatchObject(
      { code: 'invalid_input' },
    );
  });

  it('shallow- and deep-merges objects', async () => {
    expect(
      await mergeJson.execute({ auth: noAuth, props: { json1: { a: 1, b: 2 }, json2: { b: 3, c: 4 } } }),
    ).toEqual({ result: { a: 1, b: 3, c: 4 } });

    const deep = await mergeJson.execute({
      auth: noAuth,
      props: { json1: { nested: { x: 1, y: 2 } }, json2: { nested: { y: 9, z: 3 } }, deep: true },
    });
    expect(deep).toEqual({ result: { nested: { x: 1, y: 9, z: 3 } } });

    const shallow = await mergeJson.execute({
      auth: noAuth,
      props: { json1: { nested: { x: 1 } }, json2: { nested: { z: 3 } } },
    });
    expect(shallow).toEqual({ result: { nested: { z: 3 } } });
  });

  it('rejects merging non-objects', async () => {
    await expect(
      mergeJson.execute({ auth: noAuth, props: { json1: [1], json2: { a: 1 } } }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('exposes three actions, all json.* typed', () => {
    expect(jsonActions).toHaveLength(3);
    for (const action of jsonActions) expect(action.type.startsWith('json.')).toBe(true);
  });
});
