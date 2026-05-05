import type { CheckupReport, Finding } from '../core/types'

export function renderHtmlReport(report: CheckupReport): string {
  const visibleFindings = report.findings.slice(0, 20)
  const findings = visibleFindings.map(renderFinding).join('\n')
  const findingsNote = report.findings.length > visibleFindings.length
    ? `<p class="muted">Showing ${visibleFindings.length} of ${report.findings.length} supporting findings. Full evidence is available in the JSON report.</p>`
    : ''
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Lobster Checkup Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 40px auto; max-width: 920px; padding: 0 20px; color: #18181b; background: #fafafa; }
    header, section { margin-bottom: 28px; }
    h1 { font-size: 28px; margin-bottom: 8px; }
    h2 { font-size: 18px; margin-top: 0; }
    .muted { color: #71717a; font-size: 13px; }
    .summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
    .dimensions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .stat, .finding, .issue { background: white; border: 1px solid #e4e4e7; border-radius: 8px; padding: 14px; }
    .severity { text-transform: uppercase; font-size: 12px; font-weight: 700; color: #a1a1aa; }
    .score { font-size: 28px; font-weight: 700; }
    .issues { display: grid; gap: 8px; }
    pre { overflow: auto; background: #f4f4f5; border-radius: 6px; padding: 10px; font-size: 12px; }
  </style>
</head>
<body>
  <header>
    <h1>Lobster Checkup Report</h1>
    <div class="muted">${escapeHtml(report.generatedAt)} · ${escapeHtml(report.cwd)} · ${report.scannedSessions} sessions scanned</div>
  </header>
  <section>
    <h2>Evaluation</h2>
    <p><strong>Overall:</strong> ${escapeHtml(report.evaluation.overallStatus.replaceAll('_', ' '))} · ${report.evaluation.overallScore}/100</p>
    <div class="dimensions">
      ${report.evaluation.dimensions.map((dimension) => `<div class="stat">
        <div class="muted">${escapeHtml(dimension.label)} · ${escapeHtml(dimension.status.replaceAll('_', ' '))}</div>
        <div class="score">${dimension.score}</div>
        <p class="muted">${escapeHtml(dimension.summary)}</p>
      </div>`).join('\n')}
    </div>
  </section>
  <section>
    <h2>Top Issues</h2>
    <div class="issues">
      ${report.evaluation.topIssues.map((issue) => `<article class="issue">
        <div class="severity">${escapeHtml(issue.severity)} · ${escapeHtml(issue.dimension)}</div>
        <h2>${escapeHtml(issue.title)}</h2>
        <p>${escapeHtml(issue.description)}</p>
        <p><strong>Evidence:</strong> ${issue.evidenceCount} signal(s), ${issue.affectedSessions} session(s)</p>
        <p><strong>Action:</strong> ${escapeHtml(issue.recommendation)}</p>
      </article>`).join('\n') || '<p class="muted">No top issues.</p>'}
    </div>
  </section>
  ${report.diagnoses.length > 0 ? `<section>
    <h2>Sessions Worth Reviewing</h2>
    <div class="issues">
      ${report.diagnoses.slice(0, 3).map((diagnosis) => `<article class="issue">
        <div class="severity">${escapeHtml(diagnosis.priority)} · ${escapeHtml(diagnosis.source)}</div>
        <h2>${escapeHtml(diagnosis.title)}</h2>
        <p><strong>Goal:</strong> ${escapeHtml(diagnosis.goalSummary)}</p>
        <p><strong>Attempt:</strong> ${escapeHtml(diagnosis.attemptSummary)}</p>
        <p><strong>Risk:</strong> ${escapeHtml(diagnosis.riskSummary)}</p>
        <p><strong>Verification:</strong> ${escapeHtml(diagnosis.verificationSummary)}</p>
        <p><strong>Result:</strong> ${escapeHtml(diagnosis.finalResultSummary)}</p>
        <p><strong>Action:</strong> ${escapeHtml(diagnosis.suggestedAction)}</p>
      </article>`).join('\n')}
    </div>
  </section>` : ''}
  ${report.trend ? `<section>
    <h2>Trend</h2>
    <p class="muted">${escapeHtml(report.trend.status)}</p>
    <div class="summary">
      ${Object.entries(report.trend.metrics).map(([name, metric]) => `<div class="stat">
        <strong>${metric.current}</strong>
        <div class="muted">${escapeHtml(name)} · previous ${metric.previous} · ${escapeHtml(metric.direction)}</div>
      </div>`).join('\n')}
    </div>
  </section>` : ''}
  ${report.review ? `<section>
    <h2>Self Review</h2>
    <p><strong>Provider:</strong> ${escapeHtml(report.review.provider)}</p>
    <p>${escapeHtml(report.review.summary)}</p>
    <div class="issues">
      ${report.review.judgments.slice(0, 5).map((judgment) => `<article class="issue">
        <div class="severity">${escapeHtml(judgment.verdict)} · ${escapeHtml(judgment.dimension)}</div>
        <h2>${escapeHtml(judgment.title)}</h2>
        <p>${escapeHtml(judgment.rationale)}</p>
        <p><strong>Evidence:</strong> ${escapeHtml(judgment.evidenceRefs.join(', '))}</p>
        <p><strong>Action:</strong> ${escapeHtml(judgment.recommendation)}</p>
      </article>`).join('\n') || '<p class="muted">No review judgments.</p>'}
    </div>
  </section>` : ''}
  <section class="summary">
    <div class="stat"><strong>${report.summary.total}</strong><div class="muted">Total</div></div>
    <div class="stat"><strong>${report.summary.critical}</strong><div class="muted">Critical</div></div>
    <div class="stat"><strong>${report.summary.high}</strong><div class="muted">High</div></div>
    <div class="stat"><strong>${report.summary.medium}</strong><div class="muted">Medium</div></div>
    <div class="stat"><strong>${report.summary.low}</strong><div class="muted">Low</div></div>
  </section>
  <section>
    <h2>Supporting Findings</h2>
    ${findingsNote}
    ${findings || '<p class="muted">No findings.</p>'}
  </section>
</body>
</html>
`
}

function renderFinding(finding: Finding): string {
  return `<article class="finding">
  <div class="severity">${escapeHtml(finding.severity)} · ${escapeHtml(finding.detector)}</div>
  <h2>${escapeHtml(finding.title)}</h2>
  <p>${escapeHtml(finding.description)}</p>
  <pre>${escapeHtml(JSON.stringify(finding.evidence, null, 2))}</pre>
  <p><strong>Action:</strong> ${escapeHtml(finding.recommendation.action)}</p>
  <p class="muted">${escapeHtml(finding.recommendation.rationale)}</p>
</article>`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
