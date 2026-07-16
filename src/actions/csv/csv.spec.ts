import { FakeTransport, stubAuth } from '../../testing/fakes';
import { convertCsvToJson, convertJsonToCsv, csvActions } from './index';

const noAuth = stubAuth(new FakeTransport(() => ({ status: 200, headers: {}, data: {} })));

describe('csv actions', () => {
  it('parses CSV with a header into objects', async () => {
    const out = await convertCsvToJson.execute({
      auth: noAuth,
      props: { csv: 'name,age\nAnn,30\nBob,5' },
    });
    expect(out.result).toEqual([
      { name: 'Ann', age: '30' },
      { name: 'Bob', age: '5' },
    ]);
  });

  it('honours quoted fields with embedded commas, quotes and newlines', async () => {
    const csv = 'a,b\n"hello, world","she said ""hi"""\n"line1\nline2",plain';
    const out = await convertCsvToJson.execute({ auth: noAuth, props: { csv } });
    expect(out.result).toEqual([
      { a: 'hello, world', b: 'she said "hi"' },
      { a: 'line1\nline2', b: 'plain' },
    ]);
  });

  it('returns a matrix when there is no header', async () => {
    const out = await convertCsvToJson.execute({
      auth: noAuth,
      props: { csv: '1;2;3\n4;5;6', delimiter: ';', hasHeader: false },
    });
    expect(out.result).toEqual([
      ['1', '2', '3'],
      ['4', '5', '6'],
    ]);
  });

  it('serialises objects to CSV, quoting where needed', async () => {
    const out = await convertJsonToCsv.execute({
      auth: noAuth,
      props: {
        data: [
          { name: 'Ann', note: 'a, b' },
          { name: 'Bob', note: 'plain' },
        ],
      },
    });
    expect(out.result).toBe('name,note\nAnn,"a, b"\nBob,plain');
  });

  it('round-trips CSV → JSON → CSV', async () => {
    const csv = 'name,note\nAnn,"a, b"\nBob,plain';
    const parsed = await convertCsvToJson.execute({ auth: noAuth, props: { csv } });
    const back = await convertJsonToCsv.execute({ auth: noAuth, props: { data: parsed.result } });
    expect(back.result).toBe(csv);
  });

  it('rejects a non-array json input', async () => {
    await expect(convertJsonToCsv.execute({ auth: noAuth, props: { data: { a: 1 } } })).rejects.toMatchObject(
      { code: 'invalid_input' },
    );
  });

  it('exposes two actions, all csv.* typed', () => {
    expect(csvActions).toHaveLength(2);
    for (const action of csvActions) expect(action.type.startsWith('csv.')).toBe(true);
  });
});
