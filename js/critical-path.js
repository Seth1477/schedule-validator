// critical-path.js - Critical Path Method (CPM) Analysis

class CriticalPathAnalyzer {
  analyze(activities, relationships) {
    if (!activities || activities.length === 0) return { criticalPath: [], longestPath: [] };

    const actMap = {};
    activities.forEach(a => {
      actMap[a.id] = { ...a, es: 0, ef: a.duration, ls: 0, lf: 0, slack: 0 };
    });

    // Build adjacency
    const successors = {};
    const predecessors = {};
    activities.forEach(a => { successors[a.id] = []; predecessors[a.id] = []; });
    relationships.forEach(r => {
      if (successors[r.predecessorId]) successors[r.predecessorId].push(r);
      if (predecessors[r.successorId]) predecessors[r.successorId].push(r);
    });

    // Topological sort
    const sorted = this.topologicalSort(activities, successors);

    // Forward pass
    sorted.forEach(id => {
      const act = actMap[id];
      if (!act) return;
      const preds = predecessors[id] || [];
      if (preds.length === 0) {
        act.es = 0;
      } else {
        act.es = Math.max(...preds.map(r => {
          const pred = actMap[r.predecessorId];
          if (!pred) return 0;
          const lag = r.lag || 0;
          if (r.type === 'PR_FS' || !r.type) return pred.ef + lag;
          if (r.type === 'PR_SS') return pred.es + lag;
          if (r.type === 'PR_FF') return pred.ef + lag - act.duration;
          if (r.type === 'PR_SF') return pred.es + lag - act.duration;
          return pred.ef + lag;
        }));
      }
      act.ef = act.es + act.duration;
    });

    // Project end
    const projectEnd = Math.max(...Object.values(actMap).map(a => a.ef));

    // Backward pass
    [...sorted].reverse().forEach(id => {
      const act = actMap[id];
      if (!act) return;
      const succs = successors[id] || [];
      if (succs.length === 0) {
        act.lf = projectEnd;
      } else {
        act.lf = Math.min(...succs.map(r => {
          const succ = actMap[r.successorId];
          if (!succ) return projectEnd;
          const lag = r.lag || 0;
          if (r.type === 'PR_FS' || !r.type) return succ.ls - lag;
          if (r.type === 'PR_SS') return succ.ls - lag + act.duration;
          if (r.type === 'PR_FF') return succ.lf - lag;
          if (r.type === 'PR_SF') return succ.lf - lag + act.duration;
          return succ.ls - lag;
        }));
      }
      act.ls = act.lf - act.duration;
      act.slack = +(act.lf - act.ef).toFixed(2);
      act.computedCritical = Math.abs(act.slack) < 0.01;
    });

    const criticalActivities = Object.values(actMap).filter(a => a.computedCritical);
    const longestPath = this.findLongestPath(actMap, successors, sorted);

    return {
      criticalPath: criticalActivities,
      longestPath,
      projectDuration: projectEnd,
      activityMap: actMap
    };
  }

  topologicalSort(activities, successors) {
    const visited = new Set();
    const result = [];
    const temp = new Set();

    const visit = (id) => {
      if (temp.has(id)) return;
      if (visited.has(id)) return;
      temp.add(id);
      (successors[id] || []).forEach(r => visit(r.successorId));
      temp.delete(id);
      visited.add(id);
      result.unshift(id);
    };

    activities.forEach(a => {
      if (!visited.has(a.id)) visit(a.id);
    });
    return result;
  }

  findLongestPath(actMap, successors, sorted) {
    const dist = {};
    const prev = {};
    sorted.forEach(id => { dist[id] = actMap[id] ? actMap[id].duration : 0; });

    sorted.forEach(id => {
      const act = actMap[id];
      if (!act) return;
      (successors[id] || []).forEach(r => {
        const succ = actMap[r.successorId];
        if (!succ) return;
        const newDist = dist[id] + (succ.duration || 0) + (r.lag || 0);
        if (newDist > (dist[r.successorId] || 0)) {
          dist[r.successorId] = newDist;
          prev[r.successorId] = id;
        }
      });
    });

    // Find end node
    const endId = sorted.reduce((maxId, id) => dist[id] > dist[maxId] ? id : maxId, sorted[0]);

    // Trace back
    const path = [];
    let cur = endId;
    while (cur) {
      if (actMap[cur]) path.unshift(actMap[cur]);
      cur = prev[cur];
    }
    return path;
  }
}

window.CriticalPathAnalyzer = CriticalPathAnalyzer;
