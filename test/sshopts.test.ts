// src/sshopts.ts for each real deployment hpcworker publishes (its export `profiles`, taken into
// test/profiles/): the options pin the profile's key file and port and loosen nothing, they are the
// union of what the two editions pass today (typed below as read at beethoven-desktop 9ce98bb,
// src/ssh.ts, and beethoven-vscode e7526f9, extension/src/core/shell.ts and sshConfig.ts), and a value
// that could carry more than itself is refused. fingerprintMatches is held to the shape the profile
// reader takes, and to what ssh-keygen itself printed for three keys made for this test.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readProfileText, sshTargetOf } from '../src/profile.js';
import { BATCH_OPTIONS, fingerprintMatches, PINNED_OPTIONS, SSH_FINGERPRINT, sshOptions, type SshOptionValues } from '../src/sshopts.js';
import { ROOT } from './origin.js';

const at = (...p: string[]) => join(ROOT, 'test', ...p);
const doors = readdirSync(at('profiles'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => {
    const r = readProfileText(readFileSync(at('profiles', f), 'utf8'));
    const t = r && sshTargetOf(r.profile);
    if (!t || !t.ok) throw new Error(`${f} declares no ssh door`);
    return { id: f.slice(0, -'.json'.length), ...t };
  });
const KH = '/home/ab1234/.beethoven-desktop/known_hosts';
const argv = (v: Partial<SshOptionValues> = {}) => {
  const r = sshOptions({ knownHosts: KH, port: 22, session: 'batch', ...v });
  if (!r.ok) throw new Error(`refused: ${JSON.stringify(r)}`);
  return r.argv;
};
/** the -o values of a fragment, in order */
const options = (a: string[]) => a.flatMap((x, i) => (a[i - 1] === '-o' ? [x] : []));
const keyOf = (o: string) => o.slice(0, o.indexOf('=')).toLowerCase();
const ch = (n: number) => String.fromCharCode(n);

describe('the options, for each real deployment', () => {
  it('are at least one deployment, each with its pinned key and port', () => {
    expect(doors.length).toBeGreaterThan(0);
    for (const d of doors) expect(SSH_FINGERPRINT.test(d.hostKey), d.id).toBe(true);
  });

  it("pin Wayne State's key for the name the profile measured it at, grid.wayne.edu port 22: the name a known_hosts line for the pin carries, which is not the warrior.grid.wayne.edu VS Code's alias names (design 15.3)", () => {
    const wayne = doors.find((d) => d.id === 'wayne');
    expect(wayne).toEqual({ id: 'wayne', ok: true, host: 'grid.wayne.edu', port: 22, hostKey: 'SHA256:kLTz1xK6anQ1denM+31kDEryQtgan2P76r9aLno+K3s' });
    // base names no HostKeyAlias, so ssh looks the key up under the name it connects to
    expect(options(argv()).some((o) => keyOf(o) === 'hostkeyalias')).toBe(false);
  });

  it('a batch session pins the key file, checks the key strictly, forwards nothing, never prompts, and names the port', () => {
    for (const d of doors) {
      expect(argv({ port: d.port }), d.id).toEqual([
        '-o', `UserKnownHostsFile=${KH}`,
        '-o', `GlobalKnownHostsFile=${KH}`,
        '-o', 'StrictHostKeyChecking=yes',
        '-o', 'CheckHostIP=no',
        '-o', 'UpdateHostKeys=no',
        '-o', 'VerifyHostKeyDNS=no',
        '-o', 'NoHostAuthenticationForLocalhost=no',
        '-o', 'ForwardAgent=no',
        '-o', 'ForwardX11=no',
        '-o', 'ClearAllForwardings=yes',
        '-o', 'PermitLocalCommand=no',
        '-o', 'GSSAPIAuthentication=no',
        '-o', 'MACs=+hmac-sha1',
        '-o', 'AddressFamily=inet',
        '-o', 'ConnectTimeout=20',
        '-o', 'ControlPath=none',
        '-o', 'ControlMaster=no',
        '-o', 'BatchMode=yes',
        '-o', 'LogLevel=ERROR',
        '-p', String(d.port),
      ]);
    }
  });

  it("the student's sign-in has the same pin and the same port, and nothing that would stop ssh's own prompts", () => {
    for (const d of doors) {
      const signIn = argv({ port: d.port, session: 'sign-in' });
      const batch = argv({ port: d.port });
      expect(options(signIn), d.id).toEqual(options(batch).filter((o) => !(BATCH_OPTIONS as readonly string[]).includes(o)));
      expect(signIn.slice(-2), d.id).toEqual(['-p', String(d.port)]);
      expect(options(signIn).some((o) => /^(BatchMode|LogLevel)=/i.test(o)), d.id).toBe(false);
    }
  });

  it('a port the profile names is passed as it is, from 1 to 65535', () => {
    for (const port of [1, 22, 2222, 65535]) expect(argv({ port }).slice(-2)).toEqual(['-p', String(port)]);
  });
});

describe('what the editions pass today, and the stricter side where they differ', () => {
  // beethoven-desktop 9ce98bb src/ssh.ts: common() and callArgv(), without what stays in desktop
  // (-l and its account, ServerAliveInterval and ServerAliveCountMax) and its connection sharing, which
  // base takes as the controlPath value (tested below)
  const DESKTOP_CALL = [
    'MACs=+hmac-sha1', 'AddressFamily=inet', `UserKnownHostsFile=${KH}`, 'StrictHostKeyChecking=yes', 'CheckHostIP=no',
    'UpdateHostKeys=no', 'ForwardAgent=no', 'ForwardX11=no', 'ClearAllForwardings=yes', 'PermitLocalCommand=no',
    'BatchMode=yes', 'ConnectTimeout=20', 'LogLevel=ERROR',
  ];
  // desktop's signInArgv(): common() without the same (ControlPersist and ServerAliveInterval=60 stay too)
  const DESKTOP_SIGN_IN = DESKTOP_CALL.filter((o) => !['BatchMode=yes', 'ConnectTimeout=20', 'LogLevel=ERROR'].includes(o));
  // beethoven-vscode e7526f9 extension/src/core/shell.ts:135, SSH_BATCH_OPTS, on every ssh and scp it runs
  const VSCODE_BATCH = ['BatchMode=yes', 'ConnectTimeout=20', 'MACs=+hmac-sha1', 'AddressFamily=inet', 'GSSAPIAuthentication=no'];
  // its sshConfig.ts managed block for the login node, which every session through its alias reads (the
  // ones that stay in VS Code: HostName, User, IdentityFile, IdentitiesOnly, PreferredAuthentications,
  // ServerAliveInterval, ServerAliveCountMax)
  const VSCODE_LOGIN_HOST = ['GSSAPIAuthentication=no', 'AddressFamily=inet', 'MACs=+hmac-sha1', 'ConnectTimeout=20'];

  it("every option either edition passes on a call is in the batch fragment, with the same value", () => {
    const ours = options(argv());
    for (const o of [...DESKTOP_CALL, ...VSCODE_BATCH, ...VSCODE_LOGIN_HOST]) expect(ours, o).toContain(o);
  });

  it("every option either edition passes on the student's sign-in is in the sign-in fragment", () => {
    const ours = options(argv({ session: 'sign-in' }));
    for (const o of [...DESKTOP_SIGN_IN, ...VSCODE_LOGIN_HOST]) expect(ours, o).toContain(o);
  });

  it("nothing more than the union, the four that close every other source of host keys or way past them, and no shared connection", () => {
    // the student's own configuration, or a file it includes, could otherwise name a second file of
    // keys, a command that prints keys, keys taken from DNS, or no check at all for a loopback address,
    // and ssh would trust them beside the pin; or share a connection another ssh opened, over which no
    // key is checked (each measured with OpenSSH 9.6p1 against a local sshd, design 15.4)
    const today = new Set([...DESKTOP_CALL, ...VSCODE_BATCH, ...VSCODE_LOGIN_HOST]);
    const closing = new Set([`GlobalKnownHostsFile=${KH}`, 'VerifyHostKeyDNS=no', 'KnownHostsCommand=none', 'NoHostAuthenticationForLocalhost=no']);
    const sharing = new Set(['ControlPath=none', 'ControlMaster=no']);
    for (const opensshVersion of ['OpenSSH_9.6p1', undefined]) {
      const ours = options(argv(opensshVersion ? { opensshVersion } : {}));
      for (const o of ours) expect(today.has(o) || closing.has(o) || sharing.has(o), o).toBe(true);
      expect(ours.filter((o) => closing.has(o)), String(opensshVersion)).toHaveLength(opensshVersion ? 4 : 3);
      expect(ours.filter((o) => sharing.has(o)), String(opensshVersion)).toHaveLength(2);
    }
  });

  it("the host key: VS Code's node hosts accept a new key (accept-new); base takes desktop's pin, and nothing loosens it", () => {
    for (const session of ['batch', 'sign-in'] as const) {
      for (const opensshVersion of [undefined, 'OpenSSH_9.6p1 Ubuntu-3ubuntu13.19, OpenSSL 3.0.13 30 Jan 2024']) {
        const what = `${session}, ${opensshVersion ?? 'no version'}`;
        const ours = options(argv({ session, ...(opensshVersion ? { opensshVersion } : {}) }));
        expect(ours.filter((o) => keyOf(o) === 'stricthostkeychecking'), what).toEqual(['StrictHostKeyChecking=yes']);
        expect(ours.filter((o) => keyOf(o) === 'userknownhostsfile'), what).toEqual([`UserKnownHostsFile=${KH}`]);
        // the system-wide file, which the student's configuration could otherwise rename, is the pinned file too
        expect(ours.filter((o) => keyOf(o) === 'globalknownhostsfile'), what).toEqual([`GlobalKnownHostsFile=${KH}`]);
        expect(ours.filter((o) => keyOf(o) === 'verifyhostkeydns'), what).toEqual(['VerifyHostKeyDNS=no']);
        expect(ours.filter((o) => keyOf(o) === 'knownhostscommand'), what).toEqual(opensshVersion ? ['KnownHostsCommand=none'] : []);
        // a loopback address (a tunnel, or the grid's name mapped there) is checked like any other
        expect(ours.filter((o) => keyOf(o) === 'nohostauthenticationforlocalhost'), what).toEqual(['NoHostAuthenticationForLocalhost=no']);
        // no connection another ssh opened, over which no key is checked
        expect(ours.filter((o) => keyOf(o) === 'controlpath'), what).toEqual(['ControlPath=none']);
        expect(ours.filter((o) => keyOf(o) === 'controlmaster'), what).toEqual(['ControlMaster=no']);
        // nothing that renames the host the key is looked up under
        for (const k of ['hostkeyalias', 'proxycommand', 'proxyjump']) {
          expect(ours.some((o) => keyOf(o) === k), `${what}: ${k}`).toBe(false);
        }
        expect(ours.some((o) => /=(?:no|off|ask|accept-new|\/dev\/null)$/i.test(o) && /^(StrictHostKeyChecking|UserKnownHostsFile)=/i.test(o)), what).toBe(false);
      }
    }
  });

  it("names KnownHostsCommand only to an ssh that has it (OpenSSH 8.5 and later), since an older one refuses the word and every call with it", () => {
    // Windows 10's own OpenSSH is 7.7 or 8.1 and Ubuntu 20.04's 8.2: there no configuration can name
    // such a command either, so nothing is open
    const has = (opensshVersion: string) => options(argv({ opensshVersion })).includes('KnownHostsCommand=none');
    for (const v of ['OpenSSH_8.5p1', 'OpenSSH_8.9p1 Ubuntu-3ubuntu0.10, OpenSSL 3.0.2 15 Mar 2022', 'OpenSSH_9.6p1 Ubuntu-3ubuntu13.19, OpenSSL 3.0.13 30 Jan 2024', 'OpenSSH_for_Windows_9.5p1, LibreSSL 3.8.2', 'OpenSSH_9.9p2, LibreSSL 3.3.6', 'OpenSSH_10.0p2', 'OpenSSH_9.6p1\n']) {
      expect(has(v), v).toBe(true);
    }
    for (const v of ['OpenSSH_8.4p1 Debian-5+deb11u3, OpenSSL 1.1.1w  11 Sep 2023', 'OpenSSH_for_Windows_8.1p1, LibreSSL 3.0.2', 'OpenSSH_for_Windows_7.7p1, LibreSSL 2.6.5', 'OpenSSH_8.2p1 Ubuntu-4ubuntu0.11, OpenSSL 1.1.1f  31 Mar 2020', 'OpenSSH_7.4p1, OpenSSL 1.0.2k-fips  26 Jan 2017']) {
      expect(has(v), v).toBe(false);
    }
  });

  it("refuses a version line that is not OpenSSH's, rather than guess what the ssh takes", () => {
    for (const opensshVersion of ['', 'ssh 9.6', 'Dropbear v2022.83', 'PuTTY Release 0.81', 'openssh_9.6p1', ' OpenSSH_9.6p1', 'OpenSSH_9', 'OpenSSH_x.6p1']) {
      expect(sshOptions({ knownHosts: KH, port: 22, session: 'batch', opensshVersion }), JSON.stringify(opensshVersion)).toEqual({ ok: false, key: 'opensshVersion', code: 'shape' });
    }
  });

  it('names each option once, every -o followed by its value, the port last: ssh keeps the first value it is given', () => {
    for (const session of ['batch', 'sign-in'] as const) {
      const a = argv({ session });
      const keys = options(a).map(keyOf);
      expect(new Set(keys).size, session).toBe(keys.length);
      for (let i = 0; i < a.length - 2; i += 2) {
        expect(a[i], `${session} ${i}`).toBe('-o');
        expect(a[i + 1], `${session} ${i}`).toMatch(/^[A-Za-z0-9]+=\S+$/);
      }
      expect(a.at(-2)).toBe('-p');
      expect([...PINNED_OPTIONS, ...BATCH_OPTIONS].every((o) => /^[A-Za-z0-9]+=[^\s]+$/.test(o))).toBe(true);
    }
  });
});

describe("connection sharing: base's alone, so no master another ssh opened carries a pinned call", () => {
  // A ControlMaster/ControlPath line in the student's configuration (often advised for one-time-code
  // sign-ins) would otherwise run the pinned ssh over a master another ssh opened, and no key is checked
  // at all; ControlMaster=no alone still uses one (measured with OpenSSH 9.6p1 against a local sshd).
  it('without a controlPath, shares nothing: ControlPath=none and ControlMaster=no, for every program and session', () => {
    for (const session of ['batch', 'sign-in'] as const) {
      for (const tool of ['ssh', 'scp', 'sftp'] as const) {
        const ours = options(argv({ session, tool }));
        expect(ours.filter((o) => /^Control/.test(o)), `${session} ${tool}`).toEqual(['ControlPath=none', 'ControlMaster=no']);
      }
    }
  });

  it("with the edition's own controlPath, names that one path and leaves ControlMaster and ControlPersist to the edition", () => {
    // desktop's two routes at 9ce98bb (src/ssh.ts routeFor): its folder in WSL's home, and its local folder
    for (const controlPath of ['~/.beethoven-desktop/cm-%C', '/home/ab1234/.beethoven-desktop/cm-%C', '/Users/ab1234/.beethoven-desktop/cm-%C', 'C:\\Users\\ab1234\\cm-%C']) {
      for (const session of ['batch', 'sign-in'] as const) {
        const ours = options(argv({ session, controlPath }));
        expect(ours.filter((o) => /^Control/.test(o)), `${session} ${controlPath}`).toEqual([`ControlPath=${controlPath}`]);
        // every other option is what it is without sharing
        expect(ours.filter((o) => !/^Control/.test(o)), controlPath).toEqual(options(argv({ session })).filter((o) => !/^Control/.test(o)));
      }
    }
  });

  it('refuses a controlPath that is empty, relative, or that ssh would split, unquote, unescape or expand from the environment', () => {
    for (const controlPath of [
      '',
      'none',
      'cm-%C',
      './cm-%C',
      '~',
      '~user/cm',
      '-oProxyCommand=sh',
      '/home/ab1234/my files/cm-%C',
      `/home/ab1234/cm${ch(10)}-oProxyCommand=sh`,
      `/home/ab1234${ch(9)}cm`,
      `/home/ab1234${ch(0)}cm`,
      '/home/ab1234/"cm"',
      "/home/ab1234/'cm'",
      '/home/${USER}/cm',
      '/home/ab1234/a=b/cm',
      'C:\\Users\\\\ab1234\\cm',
      7 as unknown as string,
    ]) {
      expect(sshOptions({ knownHosts: KH, port: 22, session: 'batch', controlPath }), JSON.stringify(controlPath)).toEqual({ ok: false, key: 'controlPath', code: 'shape' });
    }
    // every C0 control character (ESC and 0x01 among them, not only those \s also matches), DEL and every C1 one, 0x9b the one-byte CSI
    for (const c of [...Array.from({ length: 0x20 }, (_, i) => i), ...Array.from({ length: 0x9f - 0x7f + 1 }, (_, i) => 0x7f + i)]) {
      const controlPath = `/home/ab1234/cm${ch(c)}%C`;
      expect(sshOptions({ knownHosts: KH, port: 22, session: 'batch', controlPath }), c.toString(16)).toEqual({ ok: false, key: 'controlPath', code: 'shape' });
    }
  });
});

describe('the port flag of the program that takes the options', () => {
  // scp and sftp read -p as "keep the times" and take the next word as a file, so the port goes as -P
  // (measured with scp from OpenSSH 9.6p1: "scp: stat local \"22\": No such file or directory")
  it('is -p for ssh, the default, and -P for scp and sftp, the options before it the same', () => {
    for (const port of [22, 2222]) {
      expect(argv({ port }).slice(-2)).toEqual(['-p', String(port)]);
      expect(argv({ port, tool: 'ssh' })).toEqual(argv({ port }));
      for (const tool of ['scp', 'sftp'] as const) {
        const a = argv({ port, tool });
        expect(a.slice(-2), tool).toEqual(['-P', String(port)]);
        expect(a.slice(0, -2), tool).toEqual(argv({ port }).slice(0, -2));
        expect(a.includes('-p'), tool).toBe(false);
      }
    }
  });

  it('refuses any other program', () => {
    for (const tool of ['rsync', 'SCP', '', 'ssh ']) {
      expect(sshOptions({ knownHosts: KH, port: 22, session: 'batch', tool: tool as SshOptionValues['tool'] }), tool).toEqual({ ok: false, key: 'tool', code: 'shape' });
    }
  });
});

describe('a value that could carry more than itself is refused, never quoted', () => {
  it('takes an absolute known_hosts path of either family of systems, letters of any script included', () => {
    for (const knownHosts of [
      KH,
      '/mnt/c/Users/ab1234/.beethoven-desktop/known_hosts',
      'C:\\Users\\ab1234\\.beethoven-desktop\\known_hosts',
      'c:/Users/ab1234/.beethoven-desktop/known_hosts',
      'C:\\Users\\José\\.beethoven-desktop\\known_hosts',
      'C:\\Users\\AB1234~1\\.beethoven-desktop\\known_hosts',
      '/home/ab1234/a,b/known_hosts',
      '/home/ab1234/#/known_hosts',
    ]) {
      expect(argv({ knownHosts })[1], knownHosts).toBe(`UserKnownHostsFile=${knownHosts}`);
    }
  });

  it('refuses a known_hosts path that is empty, relative, or that ssh would split, unquote, unescape or expand', () => {
    expect(sshOptions({ knownHosts: '', port: 22, session: 'batch' })).toEqual({ ok: false, key: 'knownHosts', code: 'missing' });
    // no path at all, or a value that is no text: never joined or turned into one
    for (const knownHosts of [undefined, null, 7, ['/a', '/b'], { toString: () => '/a' }]) {
      expect(sshOptions({ knownHosts: knownHosts as unknown as string, port: 22, session: 'batch' }), JSON.stringify(knownHosts)).toEqual({ ok: false, key: 'knownHosts', code: 'missing' });
    }
    // every C0 control character (ESC and 0x01 among them, not only those \s also matches), DEL and every C1 one
    for (const c of [...Array.from({ length: 0x20 }, (_, i) => i), ...Array.from({ length: 0x9f - 0x7f + 1 }, (_, i) => 0x7f + i)]) {
      expect(sshOptions({ knownHosts: `/home/a${ch(c)}b/known_hosts`, port: 22, session: 'batch' }), c.toString(16)).toEqual({ ok: false, key: 'knownHosts', code: 'shape' });
    }
    for (const knownHosts of [
      'known_hosts',
      './known_hosts',
      '~/.ssh/known_hosts',
      '~',
      '-oProxyCommand=sh',
      '-',
      'C:known_hosts',
      '\\\\server\\share\\known_hosts',
      '\\Users\\ab1234\\known_hosts',
      '/home/ab1234/my files/known_hosts',
      `/home/ab1234/known_hosts${ch(10)}`,
      `/home/ab1234/known_hosts${ch(10)}-oProxyCommand=sh`,
      `/home/ab1234${ch(9)}known_hosts`,
      `/home/ab1234${ch(13)}known_hosts`,
      `/home/ab1234${ch(0)}known_hosts`,
      `/home/ab1234${ch(0x7f)}known_hosts`,
      `/home/ab1234${ch(0x85)}known_hosts`,
      `/home/ab1234${ch(0xa0)}known_hosts`,
      `/home/ab1234${ch(0x2028)}known_hosts`,
      '/home/ab1234/"known_hosts"',
      "/home/ab1234/'known_hosts'",
      '/home/%u/known_hosts',
      '/home/ab1234/%%/known_hosts',
      '/home/${USER}/known_hosts',
      '/home/$USER/known_hosts',
      '/home/ab1234/a=b/known_hosts',
      'C:\\Users\\\\ab1234\\known_hosts',
      '/home/ab1234/known_hosts /etc/ssh/other_known_hosts',
    ]) {
      expect(sshOptions({ knownHosts, port: 22, session: 'batch' }), JSON.stringify(knownHosts)).toEqual({ ok: false, key: 'knownHosts', code: 'shape' });
    }
  });

  it('refuses a port that is not a whole number from 1 to 65535', () => {
    for (const port of [0, -22, 65536, 22.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53]) {
      expect(sshOptions({ knownHosts: KH, port, session: 'batch' }), String(port)).toEqual({ ok: false, key: 'port', code: 'shape' });
    }
  });

  it('refuses a session that is neither batch nor sign-in', () => {
    for (const session of ['interactive', '', 'BATCH']) {
      expect(sshOptions({ knownHosts: KH, port: 22, session: session as SshOptionValues['session'] }), session).toEqual({ ok: false, key: 'session', code: 'shape' });
    }
  });
});

describe('fingerprintMatches', () => {
  // Made for this test on 2026-10-08 with ssh-keygen (OpenSSH_9.6p1 Ubuntu-3ubuntu13.19) and printed by
  // `ssh-keygen -l -f`; the private halves were deleted. ssh-keygen printed 43 characters after SHA256:
  // for each, with no "=" (OpenSSH's fingerprint_b64 trims the padding).
  const MEASURED: Array<[string, string]> = [
    ['AAAAC3NzaC1lZDI1NTE5AAAAINudh0ro/oi2r3JUDLweCyv40W3GU72EI9tUL0tKHFBJ', 'SHA256:oeYv5BzhrAExb0zaAGo06yt2xwoSr+OU8HzVbVytJis'],
    [
      'AAAAB3NzaC1yc2EAAAADAQABAAABAQDBPXKSzoU/w8mbW4X1j90AO6FSS93mJG6znGLw75dVHYm4y5Luu22kUhULiFlVbhQ6daeIHq3eJsMx/vAjHv70uN0F1A4Rfa+O/3fwEISoii5jLmRGcS6/d1LcLct6xm+iX4bnLSjJCNSs0ah3C16MbmLuOM8KmQ0hCt7AOZ3tWCi3oWT2G/sLdHbALxpXNdf7CjdXLTYQKut/Gw6tekIboD9InsLewBfx33Ypf3ZFYE6uWPqJ8c5gLNzrHHKfZUeKODS1DMQOS/NKPFyQ6BUy5DeJ2/2xay4nNQ4VsUOO8tuyE1x8dxGBA9hCyXf22GXnstqUZg1H2G5e/aTPSB8T',
      'SHA256:2BQ4NXTpw9ZYiE1u60l7SQA+9DjkXSWMerw9fZvMWsA',
    ],
    [
      'AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBEdG/qJhoEjsP8vF6mbFfUeFOGADVzaAh/XnMhcVdIGqqxOyJf18nu/v8pdn9ToJ/gW6sYw3Qrq+PmgPAOWjYtc=',
      'SHA256:E9V2Krpxmx6gxofiDuKck6vdk+1lc3ZGZKYfROmk1oI',
    ],
  ];
  // what an edition computes: SHA-256 of the key's blob, in base64 (Node pads it with one "=")
  const padded = (blob: string) => 'SHA256:' + createHash('sha256').update(Buffer.from(blob, 'base64')).digest('base64');

  it("the edition's own computation, with the padding removed, is what ssh-keygen printed, and matches it; the padded one does not", () => {
    for (const [blob, printed] of MEASURED) {
      expect(SSH_FINGERPRINT.test(printed), printed).toBe(true);
      expect(padded(blob)).toBe(`${printed}=`);
      expect(fingerprintMatches(printed, padded(blob).replace(/=+$/, '')), printed).toBe(true);
      expect(fingerprintMatches(printed, padded(blob)), printed).toBe(false);
      expect(fingerprintMatches(`${printed}=`, `${printed}=`), printed).toBe(false);
    }
  });

  it("is the shape the profile reader pins: what sshTargetOf takes as ssh_host_key, SSH_FINGERPRINT takes, and nothing else", () => {
    const [d] = doors;
    const pin = d!.hostKey;
    const candidates = [
      pin, `${pin}=`, pin.slice(0, -1), pin.toLowerCase(), pin.replace('SHA256:', 'sha256:'), pin.replace('SHA256:', 'SHA-256:'),
      pin.replace('SHA256:', 'MD5:'), ` ${pin}`, `${pin} `, `${pin}\n`, `${pin}A`, `SHA256:${'A'.repeat(44)}`, `SHA256:${'A'.repeat(42)}_`, `SHA256:${'A'.repeat(42)}-`, `SHA256:${'/'.repeat(43)}`, 'SHA256:', '',
      ...MEASURED.map(([, p]) => p),
    ];
    for (const c of candidates) {
      expect(sshTargetOf({ ssh_host: 'login.example.org', ssh_host_key: c }).ok, JSON.stringify(c)).toBe(SSH_FINGERPRINT.test(c));
    }
  });

  it("each real deployment's pin matches itself, exactly", () => {
    for (const d of doors) expect(fingerprintMatches(d.hostKey, d.hostKey), d.id).toBe(true);
  });

  it('a fingerprint that differs in one character, at any place, does not match', () => {
    for (const d of doors) {
      const body = d.hostKey.slice('SHA256:'.length);
      for (let i = 0; i < body.length; i++) {
        const c = body[i]!;
        const other = c === 'A' ? 'B' : 'A';
        const seen = `SHA256:${body.slice(0, i)}${other}${body.slice(i + 1)}`;
        expect(fingerprintMatches(d.hostKey, seen), `${d.id} at ${i}`).toBe(false);
        expect(fingerprintMatches(seen, d.hostKey), `${d.id} at ${i}, the other way`).toBe(false);
      }
    }
  });

  it('a fingerprint that differs only in the case of a letter does not match: base64 tells them apart', () => {
    for (const d of doors) {
      const body = d.hostKey.slice('SHA256:'.length);
      let letters = 0;
      for (let i = 0; i < body.length; i++) {
        const c = body[i]!;
        const flipped = c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase();
        if (flipped === c) continue;
        letters++;
        expect(fingerprintMatches(d.hostKey, `SHA256:${body.slice(0, i)}${flipped}${body.slice(i + 1)}`), `${d.id} at ${i}`).toBe(false);
      }
      expect(letters, d.id).toBeGreaterThan(0);
      expect(fingerprintMatches(d.hostKey, d.hostKey.toLowerCase()), d.id).toBe(false);
      expect(fingerprintMatches(d.hostKey.toUpperCase(), d.hostKey), d.id).toBe(false);
    }
  });

  it('a fingerprint with another prefix, padding, a 44th character, white space or no prefix does not match, though its digits are the same', () => {
    for (const d of doors) {
      const body = d.hostKey.slice('SHA256:'.length);
      for (const seen of [`sha256:${body}`, `SHA-256:${body}`, `SHA256 ${body}`, `MD5:${body}`, body, `SHA256:${body}=`, `SHA256:${body}A`, ` ${d.hostKey}`, `${d.hostKey} `, `${d.hostKey}\n`, `256 ${d.hostKey} (RSA)`]) {
        expect(fingerprintMatches(d.hostKey, seen), JSON.stringify(seen)).toBe(false);
        expect(fingerprintMatches(seen, seen), `${JSON.stringify(seen)} against itself`).toBe(false);
      }
    }
  });

  it('anything that is not a string, on either side, never matches', () => {
    const pin = doors[0]!.hostKey;
    for (const x of [undefined, null, 0, true, {}, [pin], { toString: () => pin }]) {
      expect(fingerprintMatches(pin, x), String(x)).toBe(false);
      expect(fingerprintMatches(x, pin), String(x)).toBe(false);
    }
  });
});
