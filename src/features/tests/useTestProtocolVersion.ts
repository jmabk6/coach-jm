import { useCallback, useEffect, useState } from "react";
import { getTestProtocol, getTestProtocolVersion } from "../../db/repositories/testRepository";
import type { Id, TestProtocol, TestProtocolVersion } from "../../domain";

/**
 * Le protocole d'une brique test et la version capturée au démarrage.
 * `reload` relit la version après un réglage (unité des sprints, D17).
 */
export function useTestProtocolVersion(
  protocolId: Id,
  versionId: Id,
): { protocol: TestProtocol | undefined; version: TestProtocolVersion | undefined; reload: () => void } {
  const [state, setState] = useState<{ protocol?: TestProtocol; version?: TestProtocolVersion }>({});
  const [counter, setCounter] = useState(0);
  const reload = useCallback(() => setCounter((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getTestProtocol(protocolId), getTestProtocolVersion(versionId)]).then(([protocol, version]) => {
      if (!cancelled) setState({ ...(protocol ? { protocol } : {}), ...(version ? { version } : {}) });
    });
    return () => {
      cancelled = true;
    };
  }, [protocolId, versionId, counter]);

  return { protocol: state.protocol, version: state.version, reload };
}
