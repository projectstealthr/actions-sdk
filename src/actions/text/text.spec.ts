import { FakeTransport, stubAuth } from '../../testing/fakes';
import {
  concat,
  defaultValue,
  find,
  findAll,
  jsonToAsciiTable,
  replace,
  slugify,
  split,
  stripHtml,
  textActions,
} from './index';

const noAuth = stubAuth(new FakeTransport(() => ({ status: 200, headers: {}, data: {} })));

describe('text actions', () => {
  it('concatenates values with a separator', async () => {
    expect(
      await concat.execute({ auth: noAuth, props: { values: ['a', 'b', 'c'], separator: '-' } }),
    ).toEqual({
      result: 'a-b-c',
    });
    expect(await concat.execute({ auth: noAuth, props: { values: [1, 2, 3] } })).toEqual({ result: '123' });
  });

  it('rejects a non-array concat input', async () => {
    await expect(concat.execute({ auth: noAuth, props: { values: 'not-an-array' } })).rejects.toMatchObject({
      code: 'invalid_input',
    });
  });

  it('replaces literally and by regex', async () => {
    expect(
      await replace.execute({ auth: noAuth, props: { text: 'a.b.c', find: '.', replacement: '_' } }),
    ).toEqual({ result: 'a_b_c' });
    expect(
      await replace.execute({
        auth: noAuth,
        props: { text: 'foo123bar', find: '\\d+', replacement: '#', useRegex: true },
      }),
    ).toEqual({ result: 'foo#bar' });
  });

  it('surfaces an invalid regex as invalid_input', async () => {
    await expect(
      replace.execute({ auth: noAuth, props: { text: 'x', find: '(', replacement: '', useRegex: true } }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('splits by a delimiter', async () => {
    expect(await split.execute({ auth: noAuth, props: { text: 'a,b,c', delimiter: ',' } })).toEqual({
      result: ['a', 'b', 'c'],
    });
  });

  it('finds first and all matches', async () => {
    expect(await find.execute({ auth: noAuth, props: { text: 'the cat sat', pattern: 'at' } })).toEqual({
      found: true,
      index: 5,
      match: 'at',
    });
    expect(await find.execute({ auth: noAuth, props: { text: 'abc', pattern: 'z' } })).toEqual({
      found: false,
      index: -1,
      match: null,
    });
    expect(
      await findAll.execute({ auth: noAuth, props: { text: 'a1b2c3', pattern: '\\d', useRegex: true } }),
    ).toEqual({ matches: ['1', '2', '3'], count: 3 });
  });

  it('slugifies text (diacritics + punctuation)', async () => {
    expect(await slugify.execute({ auth: noAuth, props: { text: 'Héllo, World!' } })).toEqual({
      slug: 'hello-world',
    });
  });

  it('falls back to a default when input is empty', async () => {
    expect(await defaultValue.execute({ auth: noAuth, props: { text: '  ', default: 'fallback' } })).toEqual({
      result: 'fallback',
    });
    expect(await defaultValue.execute({ auth: noAuth, props: { text: 'kept', default: 'x' } })).toEqual({
      result: 'kept',
    });
  });

  it('strips html tags and decodes entities', async () => {
    const out = await stripHtml.execute({
      auth: noAuth,
      props: { html: '<p>Hello&nbsp;<b>World</b> &amp; more</p><script>evil()</script>' },
    });
    expect(out.text).toBe('Hello World & more');
  });

  it('renders a JSON array of objects as an ascii table', async () => {
    const out = await jsonToAsciiTable.execute({
      auth: noAuth,
      props: {
        data: [
          { name: 'Ann', age: 30 },
          { name: 'Bob', age: 5 },
        ],
      },
    });
    expect(out.table).toContain('name');
    expect(out.table).toContain('Ann');
    expect(out.table.split('\n').length).toBeGreaterThanOrEqual(5);
  });

  it('exposes nine actions, all text.* typed', () => {
    expect(textActions).toHaveLength(9);
    for (const action of textActions) expect(action.type.startsWith('text.')).toBe(true);
  });
});
