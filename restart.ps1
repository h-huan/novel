#Requires -Version 7.0
<#
.SYNOPSIS
  项目统一重启入口：先清理前后端全部残留进程（含 nest --watch / vite 的父 CLI 与中间 cmd.exe），
  再各启动恰好一个后端与一个前端。

  后端默认启动方式 = npm run build（prebuild 先清空 dist）→ node dist/src/main.js：
    · 后端只有 1 个进程，没有中间 CLI 层，且不会读到 tsc 就地覆写的半成品产物；
    · 需要热重载时显式加 -Watch，退回 nest start --watch（仅限人工交互开发）。

.DESCRIPTION
  为什么必须有这个脚本：
    server/.env 的 DATA_DIR 指向同一个 SQLite 库文件。若上一次的后端实例没有被干净退出，
    第二个实例启动时会在迁移 / WAL 阶段抛 SQLITE_BUSY "database is locked"。

  为什么"看着杀干净了"还是会出现旧程序（v2 修掉的真实缺陷）：
    `nest start --watch` 与 vite 是【父 CLI 进程 → 中间 cmd.exe → 子应用进程】的三层结构，
    而父进程的命令行是【相对路径】（node_modules/@nestjs/cli/bin/nest.js start --watch、
    scripts/dev.js），**不含项目根绝对路径**。
    v1 只按"命令行含项目根绝对路径"匹配，于是绝对路径的子应用被杀掉、相对路径的父 CLI 存活；
    父 CLI 在下一次文件变动时立刻重建一个后端 —— 这就是"端口莫名被占 / 两个后端 /
    database is locked"的来源。用户直觉"每次运行前必须重启"成立，但 v1 的匹配口径有漏洞。
    v2 四层防御：
      (1) 启动后把 PID + 进程创建时间写入 logs/dev-pids.json；下次启动先连其全部子孙一起清理
          （创建时间用来防 PID 复用误杀无关进程）；
      (2) 相对路径父 CLI 只有在"其后代中出现本项目绝对路径进程"时才认定为本项目进程，
          不会误杀别的项目里同样叫 scripts/dev.js 的进程；
      (3) 用单次快照构建进程树，清理时【父进程优先】，断掉"边杀边重建"的源头，再二次快照收子孙；
      (4) 结束时再断言一遍无残留，把漏网进程直接打印出来（下次可立刻看到，而不是靠猜）。

  行为：
    1) 收集 3100 / 5173 / 5174（以及历史遗留的 3000）端口的 listener PID；
    2) 收集命令行指向本项目 server/ 或 desktop/ 的 node / electron / cmd 进程与其全部子孙；
    3) 先杀父再收子孙，并等待端口真正释放；
    4) 归档旧日志；后端先干净构建再以单进程启动（-Watch 时退回 nest start --watch），
       前端启动一个 Vite，PID 落盘 logs/dev-pids.json；
    5) 等待后端健康检查通过，断言每个端口只有 1 个 listener、且无残留项目进程。

.EXAMPLE
  pwsh -File .\restart.ps1
.EXAMPLE
  pwsh -File .\restart.ps1 -Only back
.EXAMPLE
  pwsh -File .\restart.ps1 -KillOnly
#>
[CmdletBinding()]
param(
  [ValidateSet('all', 'back', 'front')]
  [string]$Only = 'all',
  [switch]$KillOnly,
  # -Watch 仅限需要热重载的人工交互开发。自动化运行/复测必须走默认路径：
  # 默认 = 干净构建(npm run build，prebuild 先清空 dist) + 单进程 node dist/src/main.js。
  # 原因见下方后端启动段注释：tsc --watch 是就地覆写 dist，运行中的 node 惰性 require
  # 会读到新旧交织的半成品 .js，导致后端启动即崩、而 nest CLI 还活着并再拉起进程。
  [switch]$Watch,
  [int]$PortWaitSeconds = 20,
  [int]$HealthTimeoutSeconds = 180
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = $PSScriptRoot
$LogDir = Join-Path $ProjectRoot 'logs'
$StateFile = Join-Path $LogDir 'dev-pids.json'
$BackendPort = 3100
$FrontendPorts = @(5173, 5174)
$LegacyPorts = @(3000)
# 相对路径的父 CLI 命令行特征：这些进程自身不含项目根绝对路径，必须靠"后代是否指向本项目"来认定。
$DevCommandPatterns = @(
  'node_modules/@nestjs/cli/bin/nest.js start --watch',
  'scripts/dev.js',
  'vite\bin\vite.js',
  'vite/bin/vite.js',
  'electron\dist\electron.exe'
)

function Write-Step([string]$Message) { Write-Host "[restart] $Message" -ForegroundColor Cyan }
function Write-Note([string]$Message) { Write-Host "[restart] $Message" -ForegroundColor Yellow }

function Get-ProcessSnapshot {
  @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Select-Object ProcessId, ParentProcessId, Name, CommandLine)
}

function Get-ChildrenMap($Snapshot) {
  $map = @{}
  foreach ($p in $Snapshot) {
    $parent = [int]$p.ParentProcessId
    if (-not $map.ContainsKey($parent)) { $map[$parent] = New-Object System.Collections.Generic.List[int] }
    $map[$parent].Add([int]$p.ProcessId)
  }
  return $map
}

# 单次快照展开全部子孙：避免在循环里重复查询导致"父已被杀、子被 reparent 成孤儿"而漏杀。
function Expand-Descendants([int[]]$Roots, $ChildrenMap) {
  $all = New-Object System.Collections.Generic.List[int]
  $seen = New-Object System.Collections.Generic.HashSet[int]
  $queue = New-Object System.Collections.Generic.Queue[int]
  foreach ($r in $Roots) { if ($seen.Add([int]$r)) { $queue.Enqueue([int]$r) } }
  while ($queue.Count -gt 0) {
    $cur = $queue.Dequeue()
    $all.Add($cur)
    if ($ChildrenMap.ContainsKey($cur)) {
      foreach ($child in $ChildrenMap[$cur]) {
        if ($seen.Add($child)) { $queue.Enqueue($child) }
      }
    }
  }
  return $all
}

function Get-ListenerOwners([int[]]$Ports) {
  $ids = New-Object System.Collections.Generic.List[int]
  foreach ($port in $Ports) {
    $conns = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
    foreach ($conn in $conns) {
      if ($conn.OwningProcess -gt 0) { $ids.Add([int]$conn.OwningProcess) }
    }
  }
  $ids | Sort-Object -Unique
}

# 只返回"根"进程（父 CLI / 父开发进程 / 上一轮记录的服务）：绝对路径匹配 + 有本项目后代的相对路径父进程。
function Get-ProjectRootIds($Snapshot, $ChildrenMap, [int[]]$StateIds) {
  $absolute = New-Object System.Collections.Generic.HashSet[int]
  foreach ($p in $Snapshot) {
    $cmd = [string]$p.CommandLine
    if (-not $cmd) { continue }
    if ($p.Name -notin @('node.exe', 'electron.exe', 'cmd.exe')) { continue }
    # 跳过 Codex 自身运行时（cua-repl / server.mjs），它们不属于本项目
    if ($cmd -like '*\OpenAI\Codex\runtimes\*') { continue }
    if ($cmd -like "*$ProjectRoot\server*" -or $cmd -like "*$ProjectRoot\desktop*") {
      [void]$absolute.Add([int]$p.ProcessId)
    }
  }

  $roots = New-Object System.Collections.Generic.List[int]
  foreach ($id in $absolute) { $roots.Add($id) }
  foreach ($p in $Snapshot) {
    $cmd = [string]$p.CommandLine
    if (-not $cmd) { continue }
    if ($p.Name -ne 'node.exe') { continue }
    $hitPattern = $false
    foreach ($pattern in $DevCommandPatterns) { if ($cmd -like "*$pattern*") { $hitPattern = $true; break } }
    if (-not $hitPattern) { continue }
    $descendants = @(Expand-Descendants -Roots @([int]$p.ProcessId) -ChildrenMap $ChildrenMap)
    $owned = $false
    foreach ($d in $descendants) { if ($absolute.Contains([int]$d)) { $owned = $true; break } }
    if ($owned) { $roots.Add([int]$p.ProcessId) }
  }
  foreach ($id in $StateIds) { $roots.Add([int]$id) }
  return @($roots | Sort-Object -Unique)
}

function Read-DevState {
  if (-not (Test-Path -LiteralPath $StateFile)) { return @() }
  try { $json = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json } catch { return @() }
  $ids = New-Object System.Collections.Generic.List[int]
  foreach ($name in @('backend', 'frontend')) {
    $entry = $json.$name
    if ($null -eq $entry) { continue }
    $id = [int]$entry.pid
    if ($id -le 0) { continue }
    $proc = Get-Process -Id $id -ErrorAction SilentlyContinue
    if ($null -eq $proc) { continue }
    # PID 会被复用：进程创建时间（unix 毫秒）必须对得上，才认定是上一轮我们启动的那个。
    if ($null -ne $entry.startedAtMs) {
      try {
        $expected = [long]$entry.startedAtMs
        $actual = [long]([datetimeoffset]$proc.StartTime).ToUnixTimeMilliseconds()
        if ([Math]::Abs($actual - $expected) -gt 3000) { continue }
      } catch { }
    }
    $ids.Add($id)
  }
  return @($ids)
}

function Write-DevState($Entries) {
  $payload = [ordered]@{}
  foreach ($key in @('backend', 'frontend')) {
    if ($Entries.ContainsKey($key) -and $Entries[$key]) {
      $payload[$key] = [ordered]@{
        pid = [int]$Entries[$key].pid
        startedAtMs = [long]$Entries[$key].startedAtMs
        startedAt = [string]$Entries[$key].startedAt
      }
    }
  }
  $payload['updatedAt'] = (Get-Date).ToUniversalTime().ToString('o')
  ($payload | ConvertTo-Json -Depth 4) | Set-Content -LiteralPath $StateFile -Encoding UTF8
}

# 进程创建时间用 unix 毫秒比较：JSON 里的 ISO 字符串会被 ConvertFrom-Json 自动转成 DateTime，
# 再经 [string] 转换会丢掉 Kind，本地时区被二次换算（实测差 8 小时，PID 校验永远失败）。
# 整数比较既无时区歧义，也不受区域格式影响。
function Get-StartMs([int]$ProcId) {
  try { return [long]([datetimeoffset](Get-Process -Id $ProcId).StartTime).ToUnixTimeMilliseconds() } catch { return 0 }
}

function Get-StartText([int]$ProcId) {
  try { return (Get-Process -Id $ProcId).StartTime.ToUniversalTime().ToString('o') } catch { return '' }
}

function Stop-ProcessIds([int[]]$Ids, [string]$Reason) {
  $killed = 0
  foreach ($procId in $Ids) {
    if ($procId -eq $PID) { continue }
    $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
    if ($null -eq $proc) { continue }
    try {
      $proc.Kill()
      $proc.WaitForExit(5000) | Out-Null
      $killed++
    } catch {
      Write-Note "无法结束 PID $procId（$($proc.ProcessName)）：$($_.Exception.Message)"
    }
  }
  if ($killed -gt 0) { Write-Step "$Reason：已结束 $killed 个进程" }
  return $killed
}

function Wait-PortsFree([int[]]$Ports, [int]$TimeoutSec) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  do {
    $busy = @()
    foreach ($port in $Ports) {
      $conns = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
      if (@($conns).Count -gt 0) { $busy += $port }
    }
    if ($busy.Count -eq 0) { return $true }
    Start-Sleep -Milliseconds 400
  } while ((Get-Date) -lt $deadline)
  return $false
}

function Wait-PortListening([int[]]$Ports, [int]$TimeoutSec) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  do {
    foreach ($port in $Ports) {
      $conns = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
      if (@($conns).Count -gt 0) { return $port }
    }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)
  return 0
}

function Archive-Log([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return }
  $item = Get-Item -LiteralPath $Path
  if ($item.Length -eq 0) { Remove-Item -LiteralPath $Path -Force; return }
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $dir = Split-Path -Parent $Path
  $base = [System.IO.Path]::GetFileNameWithoutExtension($Path)
  $ext = [System.IO.Path]::GetExtension($Path)
  Move-Item -LiteralPath $Path -Destination (Join-Path $dir "$base.$stamp$ext") -Force
}

function Assert-SingleListener([int]$Port, [string]$Label) {
  $conns = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
  $count = @($conns).Count
  if ($count -eq 1) {
    Write-Step "$Label 端口 $Port ：1 个 listener（PID $(@($conns)[0].OwningProcess)）"
  } elseif ($count -eq 0) {
    Write-Note "$Label 端口 $Port ：无 listener"
  } else {
    $pids = (@($conns).OwningProcess | Sort-Object -Unique) -join ', '
    Write-Note "$Label 端口 $Port ：$count 个 listener（异常，应为 1）PID=$pids"
  }
  return $count
}

if (-not (Test-Path -LiteralPath $LogDir)) { New-Item -ItemType Directory -Force -Path $LogDir | Out-Null }

$portsToClear = @()
if ($Only -in @('all', 'back')) { $portsToClear += $BackendPort }
if ($Only -in @('all', 'front')) { $portsToClear += $FrontendPorts }
$portsToClear += $LegacyPorts
$portsToClear = @($portsToClear | Sort-Object -Unique)

Write-Step "清理目标端口：$($portsToClear -join ', ')"

$stateIds = @(Read-DevState)
if ($stateIds.Count -gt 0) { Write-Step "上一轮记录的服务 PID：$($stateIds -join ', ')（连同其全部子孙一并清理）" }

$snapshot = Get-ProcessSnapshot
$childrenMap = Get-ChildrenMap -Snapshot $snapshot
$roots = @(@(Get-ProjectRootIds -Snapshot $snapshot -ChildrenMap $childrenMap -StateIds $stateIds) + @(Get-ListenerOwners -Ports $portsToClear)) | Sort-Object -Unique
if ($roots.Count -gt 0) { Write-Step "待清理根进程 PID：$($roots -join ', ')" } else { Write-Step '待清理根进程：无' }

# 第一轮：先杀父（watcher / dev CLI），断掉"边杀边重建"的源头。
Stop-ProcessIds -Ids $roots -Reason '清理残留进程（父进程优先）' | Out-Null
Start-Sleep -Milliseconds 800

# 第二轮：父已死，重新快照收干净子孙与可能被重建的子进程（reparent 后仍按绝对路径匹配得到）。
$snapshot2 = Get-ProcessSnapshot
$childrenMap2 = Get-ChildrenMap -Snapshot $snapshot2
$secondPass = @(
  @(Expand-Descendants -Roots $roots -ChildrenMap $childrenMap2) +
  @(Get-ProjectRootIds -Snapshot $snapshot2 -ChildrenMap $childrenMap2 -StateIds @()) +
  @(Get-ListenerOwners -Ports $portsToClear)
) | Sort-Object -Unique
Stop-ProcessIds -Ids $secondPass -Reason '清理子进程与重建进程' | Out-Null
Start-Sleep -Milliseconds 600

if (-not (Wait-PortsFree -Ports $portsToClear -TimeoutSec $PortWaitSeconds)) {
  $owners = @(Get-ListenerOwners -Ports $portsToClear)
  if ($owners.Count -gt 0) {
    Write-Note "端口未释放，二次强制结束：$($owners -join ', ')"
    Stop-ProcessIds -Ids $owners -Reason '强制清理' | Out-Null
    Start-Sleep -Milliseconds 600
  }
  if (-not (Wait-PortsFree -Ports $portsToClear -TimeoutSec 10)) {
    $still = (@(Get-ListenerOwners -Ports $portsToClear)) -join ', '
    throw "端口仍被占用，无法启动：$still"
  }
}
Write-Step '端口已全部释放'

# 残留断言：清理后若还有本项目进程，直接打印出来，避免"以为干净了"。
$snapshot3 = Get-ProcessSnapshot
$childrenMap3 = Get-ChildrenMap -Snapshot $snapshot3
$residual = @(Get-ProjectRootIds -Snapshot $snapshot3 -ChildrenMap $childrenMap3 -StateIds @())
if ($residual.Count -gt 0) {
  Write-Note "仍有残留项目进程（下次启动会继续清理）：$($residual -join ', ')"
} else {
  Write-Step '无残留项目进程'
}

if ($KillOnly) {
  Write-DevState @{}
  Write-Step '仅清理模式完成（未启动服务）'
  exit 0
}

$nodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $nodeExe) { throw '未找到 node，可执行文件不在 PATH 中' }

$state = @{}
if ($Only -in @('all', 'back')) {
  Archive-Log (Join-Path $LogDir 'backend.out.log')
  Archive-Log (Join-Path $LogDir 'backend.err.log')
  Archive-Log (Join-Path $LogDir 'backend.build.log')

  # 为什么默认不再用 nest start --watch（2026-09-22 实测故障，非推测）：
  #   logs/backend.err.20260922-150625.log 记录 dist 里出现了语法坏文件：
  #     server\dist\src\chain\real-llm.service.js:410
  #       throw new GeneratedQualityGateError(prefix + '：' + sections.join(', '), content);));
  #       SyntaxError: Unexpected token ')'
  #     [NestJS] Failed to start server
  #   tsc --watch 是【就地覆写】dist 里的 .js，不是原子替换；正在运行的旧 node 进程在
  #   重新编译的同一瞬间惰性 require 该模块，就会读到新旧内容交织的半成品文件。后果是：
  #   后端崩在启动阶段，而 nest CLI 父进程仍然存活，并在下次文件变动时再拉起一个后端 ——
  #   这正是「端口莫名被占 / 有两个后端 / database is locked」的来源。
  #   改为：先 npm run build（prebuild 执行 clean 清空 dist，杜绝任何旧产物残留）→
  #   再 node 直接跑 dist/src/main.js。后端因此只有一个进程，没有中间 CLI 层。
  $npmExe = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
  if (-not $npmExe) { $npmExe = (Get-Command npm -ErrorAction SilentlyContinue).Source }
  if (-not $npmExe) { throw '未找到 npm，无法执行后端干净构建' }

  Push-Location (Join-Path $ProjectRoot 'server')
  try {
    if ($Watch) {
      Write-Note '已启用 -Watch：退回 nest start --watch（热重载，仅供人工交互开发）'
      $backend = Start-Process -FilePath $nodeExe `
        -ArgumentList '--no-warnings', 'node_modules/@nestjs/cli/bin/nest.js', 'start', '--watch' `
        -WorkingDirectory (Join-Path $ProjectRoot 'server') `
        -RedirectStandardOutput (Join-Path $LogDir 'backend.out.log') `
        -RedirectStandardError (Join-Path $LogDir 'backend.err.log') `
        -WindowStyle Hidden -PassThru
    } else {
      Write-Step '后端干净构建：npm run build（prebuild 先清空 dist）'
      $buildStarted = Get-Date
      $buildLog = & $npmExe run build 2>&1
      $buildExit = $LASTEXITCODE
      $buildSeconds = [Math]::Round(((Get-Date) - $buildStarted).TotalSeconds, 1)
      $buildLog | Add-Content -LiteralPath (Join-Path $LogDir 'backend.build.log') -Encoding utf8
      if ($buildExit -ne 0) {
        $tail = ((@($buildLog) | Select-Object -Last 25) -join [Environment]::NewLine)
        throw "后端构建失败（exit=$buildExit），已终止启动，不会带着坏产物运行。构建输出尾部：$([Environment]::NewLine)$tail"
      }
      $entryFile = Join-Path $ProjectRoot 'server\dist\src\main.js'
      if (-not (Test-Path -LiteralPath $entryFile)) { throw "后端构建产物缺失：$entryFile" }
      Write-Step "后端构建通过（$buildSeconds 秒），启动 dist/src/main.js（单进程，无 nest CLI 中间层）"
      # 入口必须写成【绝对路径】：单进程后端没有子孙进程，若命令行只有相对路径，
      # 下一轮清理时 Get-ProjectRootIds 的「绝对路径」与「有本项目后代」两条规则都匹配不到它，
      # 只能靠 dev-pids.json 与端口 listener 兜底，残留断言就会看不见后端。
      $backend = Start-Process -FilePath $nodeExe `
        -ArgumentList '--no-warnings', $entryFile `
        -WorkingDirectory (Join-Path $ProjectRoot 'server') `
        -RedirectStandardOutput (Join-Path $LogDir 'backend.out.log') `
        -RedirectStandardError (Join-Path $LogDir 'backend.err.log') `
        -WindowStyle Hidden -PassThru
    }
  } finally {
    Pop-Location
  }

  $state['backend'] = @{ pid = $backend.Id; startedAtMs = (Get-StartMs -ProcId $backend.Id); startedAt = (Get-StartText -ProcId $backend.Id) }
  Write-Step "后端已启动（PID $($backend.Id)），日志：logs/backend.out.log"
}

if ($Only -in @('all', 'back')) {
  Write-Step "等待后端健康检查：http://127.0.0.1:$BackendPort/api/v1/health"
  $deadline = (Get-Date).AddSeconds($HealthTimeoutSeconds)
  $healthy = $false
  do {
    try {
      $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$BackendPort/api/v1/health" -TimeoutSec 5 -ErrorAction Stop
      if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 300) { $healthy = $true; break }
    } catch { }
    Start-Sleep -Seconds 1
  } while ((Get-Date) -lt $deadline)
  if ($healthy) { Write-Step '后端健康检查通过' } else { Write-Note '后端健康检查超时，请查看 logs/backend.err.log' }
}

# 启动顺序是硬约束：后端未就绪就起前端，前端会在这段时间里反复抛
# "[server] backend unavailable on port 3100"（logs/desktop.err.log 实测 8 次）。
# 因此 all 模式必须"先后端 → 等健康检查通过 → 再前端"，不得并行启动。
if ($Only -in @('all', 'front')) {
  Archive-Log (Join-Path $LogDir 'desktop.log')
  Archive-Log (Join-Path $LogDir 'desktop.err.log')
  $frontend = Start-Process -FilePath $nodeExe `
    -ArgumentList 'scripts/dev.js' `
    -WorkingDirectory (Join-Path $ProjectRoot 'desktop') `
    -RedirectStandardOutput (Join-Path $LogDir 'desktop.log') `
    -RedirectStandardError (Join-Path $LogDir 'desktop.err.log') `
    -WindowStyle Hidden -PassThru
  $state['frontend'] = @{ pid = $frontend.Id; startedAtMs = (Get-StartMs -ProcId $frontend.Id); startedAt = (Get-StartText -ProcId $frontend.Id) }
  Write-Step "前端已启动（PID $($frontend.Id)），日志：logs/desktop.log"
}

Write-DevState $state
Write-Step "已记录本轮服务 PID 到 logs/dev-pids.json（下次启动据此连子孙一起清理）"

if ($Only -in @('all', 'front')) {
  $vitePort = Wait-PortListening -Ports $FrontendPorts -TimeoutSec 90
  if ($vitePort -gt 0) { Write-Step "前端已监听端口 $vitePort" } else { Write-Note '前端端口未在 90s 内监听，请查看 logs/desktop.err.log' }
}

Write-Step '---- 最终校验 ----'
if ($Only -in @('all', 'back')) { Assert-SingleListener -Port $BackendPort -Label '后端' | Out-Null }
if ($Only -in @('all', 'front')) {
  foreach ($port in $FrontendPorts) {
    if (@(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue).Count -gt 0) {
      Assert-SingleListener -Port $port -Label '前端' | Out-Null
    }
  }
}
$final = Get-ProcessSnapshot
$finalMap = Get-ChildrenMap -Snapshot $final
$finalRoots = @(Get-ProjectRootIds -Snapshot $final -ChildrenMap $finalMap -StateIds @())
$finalAll = @(Expand-Descendants -Roots $finalRoots -ChildrenMap $finalMap)
Write-Step "当前项目进程：父 CLI + 带绝对路径的子进程共 $($finalRoots.Count) 个（含全部子孙 $($finalAll.Count) 个）：$($finalRoots -join ', ')"
Write-Step "端口断言才是唯一口径：后端 3100 与前端 5173 必须各只有 1 个 listener（见上）"
Write-Step '重启流程结束'
