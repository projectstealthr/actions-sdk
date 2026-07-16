import { FakeTransport, stubAuth } from '../../testing/fakes';
import { convertJsonToXml, xmlActions } from './index';

const noAuth = stubAuth(new FakeTransport(() => ({ status: 200, headers: {}, data: {} })));

describe('xml actions', () => {
  it('serialises a nested object', async () => {
    const out = await convertJsonToXml.execute({
      auth: noAuth,
      props: { data: { user: { name: 'Ann', age: 30 } }, rootName: 'doc' },
    });
    expect(out.result).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<doc>\n  <user>\n    <name>Ann</name>\n    <age>30</age>\n  </user>\n</doc>',
    );
  });

  it('repeats a tag for array elements', async () => {
    const out = await convertJsonToXml.execute({
      auth: noAuth,
      props: { data: { item: ['a', 'b'] }, rootName: 'list' },
    });
    expect(out.result).toContain('<item>a</item>');
    expect(out.result).toContain('<item>b</item>');
  });

  it('escapes special characters', async () => {
    const out = await convertJsonToXml.execute({
      auth: noAuth,
      props: { data: { note: 'a < b & c > d' } },
    });
    expect(out.result).toContain('<note>a &lt; b &amp; c &gt; d</note>');
  });

  it('sanitises invalid element names', async () => {
    const out = await convertJsonToXml.execute({
      auth: noAuth,
      props: { data: { '1bad key': 'x' } },
    });
    expect(out.result).toContain('<_1bad_key>x</_1bad_key>');
  });

  it('exposes one action, xml.* typed', () => {
    expect(xmlActions).toHaveLength(1);
    for (const action of xmlActions) expect(action.type.startsWith('xml.')).toBe(true);
  });
});
