import { spawn, ChildProcess } from 'child_process';
import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { writeFileSync, appendFileSync, mkdirSync, existsSync, copyFileSync, unlinkSync, readFileSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import chalk from 'chalk';

interface DevEnvironmentOptions {
  port: string;
  mcpPort: string;
  serverCommand: string;
  profileDir: string;
  logFile: string;
}

class Logger {
  private logFile: string;

  constructor(logFile: string) {
    this.logFile = logFile;
    // Ensure directory exists
    const logDir = dirname(logFile);
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
    // Clear log file
    writeFileSync(this.logFile, '');
  }

  log(source: 'server' | 'browser', message: string) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${source.toUpperCase()}] ${message}\n`;
    appendFileSync(this.logFile, logEntry);
  }
}

function detectPackageManager(): string {
  if (existsSync('pnpm-lock.yaml')) return 'pnpx';
  if (existsSync('yarn.lock')) return 'yarn dlx';
  if (existsSync('package-lock.json')) return 'npx';
  return 'npx'; // fallback
}

export class DevEnvironment {
  private serverProcess: ChildProcess | null = null;
  private mcpServerProcess: ChildProcess | null = null;
  private browserContext: BrowserContext | null = null;
  private logger: Logger;
  private options: DevEnvironmentOptions;
  private screenshotDir: string;
  private mcpPublicDir: string;
  private pidFile: string;

  constructor(options: DevEnvironmentOptions) {
    this.options = options;
    this.logger = new Logger(options.logFile);
    this.screenshotDir = join(dirname(options.logFile), 'screenshots');
    this.pidFile = join(tmpdir(), 'dev-playwright.pid');
    
    // Set up MCP server public directory for web-accessible screenshots
    const currentFile = fileURLToPath(import.meta.url);
    const packageRoot = dirname(dirname(currentFile));
    this.mcpPublicDir = join(packageRoot, 'mcp-server', 'public', 'screenshots');
    
    // Ensure directories exist
    if (!existsSync(this.screenshotDir)) {
      mkdirSync(this.screenshotDir, { recursive: true });
    }
    if (!existsSync(this.mcpPublicDir)) {
      mkdirSync(this.mcpPublicDir, { recursive: true });
    }
  }

  private async checkPortsAvailable() {
    const ports = [this.options.port, this.options.mcpPort];
    
    for (const port of ports) {
      try {
        console.log(chalk.blue(`🔍 Checking port ${port}...`));
        const result = await new Promise<string>((resolve) => {
          const proc = spawn('lsof', ['-t', '-c', '-i', `:${port}`], { stdio: 'pipe' });
          let output = '';
          proc.stdout?.on('data', (data) => output += data.toString());
          proc.on('exit', () => resolve(output.trim()));
        });
        
        if (result) {
          const lines = result.split('\n').filter(line => line.trim());
          const processes = lines.map(line => {
            const parts = line.trim().split(/\s+/);
            return { name: parts[0], pid: parts[1] };
          }).filter(proc => proc.pid);
          
          const processNames = processes.map(p => p.name).join(', ');
          const pids = processes.map(p => p.pid).join(' ');
          
          console.log(chalk.red(`❌ Port ${port} is already in use by: ${processNames}`));
          console.log(chalk.yellow(`💡 To free up port ${port}, run: kill ${pids}`));
          throw new Error(`Port ${port} is already in use. Please free the port and try again.`);
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('Port')) {
          throw error; // Re-throw our custom error
        }
        // Ignore other errors - port might just be free
      }
    }
  }

  async start() {
    console.log(chalk.blue('🚀 Starting development environment...'));
    console.log(chalk.green.bold(`📊 Consolidated Log: ${this.options.logFile}`));
    console.log(chalk.gray('💡 Give Claude this log file path for AI debugging!\n'));
    
    // Check if ports are available first
    await this.checkPortsAvailable();
    
    // Write our process group ID to PID file for cleanup
    writeFileSync(this.pidFile, process.pid.toString());
    
    // Setup cleanup handlers
    this.setupCleanupHandlers();
    
    // Start user's dev server
    await this.startServer();
    
    // Start MCP server
    await this.startMcpServer();
    
    // Show URLs immediately so user knows where to look
    console.log(chalk.green('\n🔗 Quick Access URLs:'));
    console.log(chalk.blue(`🌐 Your App: http://localhost:${this.options.port}`));
    console.log(chalk.blue(`📊 Log Viewer: http://localhost:${this.options.mcpPort}/logs`));
    console.log(chalk.blue(`🤖 MCP Server: http://localhost:${this.options.mcpPort}/api/mcp/http`));
    
    // Wait for both servers to be ready
    await this.waitForServer();
    await this.waitForMcpServer();
    
    // Start browser monitoring
    await this.startBrowserMonitoring();
    
    console.log(chalk.green('\n✅ Development environment ready!'));
    console.log(chalk.blue(`📊 Logs: ${this.options.logFile}`));
    console.log(chalk.blue(`🌐 Your App: http://localhost:${this.options.port}`));
    console.log(chalk.blue(`🤖 MCP Server: http://localhost:${this.options.mcpPort}/api/mcp/http`));
    console.log(chalk.magenta(`📸 Visual Timeline: http://localhost:${this.options.mcpPort}/logs`));
    // console.log(chalk.gray(`   To stop later: kill -TERM -$(cat ${this.pidFile})`));
    console.log(chalk.yellow('\n🎯 Ready for AI debugging! All processes are running in the background.'));
    console.log(chalk.gray(`\n💡 To stop servers later: lsof -ti:${this.options.port} | xargs kill -9 && lsof -ti:${this.options.mcpPort} | xargs kill -9`));
  }

  private async startServer() {
    console.log(chalk.blue(`🔧 Starting server: ${this.options.serverCommand}`));
    
    const [command, ...args] = this.options.serverCommand.split(' ');
    
    this.serverProcess = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      detached: true, // Run independently
    });

    // Log server output (to file only, reduce stdout noise)
    this.serverProcess.stdout?.on('data', (data) => {
      const message = data.toString().trim();
      if (message) {
        this.logger.log('server', message);
      }
    });

    this.serverProcess.stderr?.on('data', (data) => {
      const message = data.toString().trim();
      if (message) {
        this.logger.log('server', `ERROR: ${message}`);
        // Only show critical server errors in stdout
        if (message.includes('FATAL') || message.includes('Error:')) {
          console.error(chalk.red('[SERVER ERROR]'), message);
        }
      }
    });

    this.serverProcess.on('exit', (code) => {
      console.log(chalk.red(`Server process exited with code ${code}`));
    });
  }

  private async startMcpServer() {
    console.log(chalk.blue(`🤖 Starting MCP server on port ${this.options.mcpPort}...`));
    
    // Get the path to our bundled MCP server
    const currentFile = fileURLToPath(import.meta.url);
    const packageRoot = dirname(dirname(currentFile)); // Go up from dist/ to package root
    const mcpServerPath = join(packageRoot, 'mcp-server');
    
    console.log(chalk.gray(`MCP server path: ${mcpServerPath}`));
    
    if (!existsSync(mcpServerPath)) {
      throw new Error(`MCP server directory not found at ${mcpServerPath}`);
    }
    
    // Read version from package.json
    const versionCurrentFile = fileURLToPath(import.meta.url);
    const versionPackageRoot = dirname(dirname(versionCurrentFile));
    const packageJsonPath = join(versionPackageRoot, 'package.json');
    let version = '0.0.0';
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      version = packageJson.version;
    } catch (error) {
      console.log(chalk.yellow('⚠️ Could not read version from package.json'));
    }

    // Start the MCP server
    this.mcpServerProcess = spawn('npm', ['run', 'dev'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      detached: true, // Run independently
      cwd: mcpServerPath,
      env: {
        ...process.env,
        PORT: this.options.mcpPort,
        LOG_FILE_PATH: this.options.logFile, // Pass log file path to MCP server
        DEV_PLAYWRIGHT_VERSION: version, // Pass version to MCP server
      },
    });

    // Log MCP server output (to file only, reduce stdout noise)
    this.mcpServerProcess.stdout?.on('data', (data) => {
      const message = data.toString().trim();
      if (message) {
        this.logger.log('server', message);
      }
    });

    this.mcpServerProcess.stderr?.on('data', (data) => {
      const message = data.toString().trim();
      if (message) {
        this.logger.log('server', `ERROR: ${message}`);
        // Only show critical MCP server errors in stdout
        if (message.includes('FATAL') || message.includes('Error:')) {
          console.error(chalk.red('[LOG VIEWER ERROR]'), message);
        }
      }
    });

    this.mcpServerProcess.on('exit', (code) => {
      console.log(chalk.red(`MCP server process exited with code ${code}`));
    });
  }

  private async waitForServer() {
    console.log(chalk.blue('⏳ Waiting for server to be ready...'));
    
    const maxAttempts = 30;
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      try {
        const response = await fetch(`http://localhost:${this.options.port}`, {
          method: 'HEAD',
          signal: AbortSignal.timeout(2000)
        });
        if (response.ok || response.status === 404) {
          console.log(chalk.green('✅ Server is ready!'));
          return;
        }
      } catch (error) {
        console.log(chalk.gray(`Server not ready yet (attempt ${attempts + 1}/${maxAttempts})...`));
      }
      
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(chalk.yellow('⚠️ Server health check failed, but continuing anyway...'));
  }

  private async waitForMcpServer() {
    console.log(chalk.blue('⏳ Waiting for MCP server to be ready...'));
    
    const maxAttempts = 30;
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      try {
        const response = await fetch(`http://localhost:${this.options.mcpPort}`, {
          method: 'HEAD',
          signal: AbortSignal.timeout(2000)
        });
        if (response.ok || response.status === 404) {
          console.log(chalk.green('✅ MCP server is ready!'));
          return;
        }
      } catch (error) {
        console.log(chalk.gray(`MCP server not ready yet (attempt ${attempts + 1}/${maxAttempts})...`));
      }
      
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(chalk.yellow('⚠️ MCP server health check failed, but continuing anyway...'));
  }

  private async startBrowserMonitoring() {
    console.log(chalk.blue('🌐 Starting playwright for browser monitoring...'));
    
    // Ensure profile directory exists
    if (!existsSync(this.options.profileDir)) {
      mkdirSync(this.options.profileDir, { recursive: true });
    }
    
    try {
      // Try to use system Chrome first
      this.browserContext = await chromium.launchPersistentContext(this.options.profileDir, {
        headless: false,
        channel: 'chrome', // Use system Chrome
        args: [
          '--remote-debugging-port=9222',
          '--disable-web-security',
          '--disable-blink-features=AutomationControlled',
          '--device-scale-factor=1.5',
        ],
      });
    } catch (error: any) {
      // Fallback to Playwright's bundled chromium
      try {
        this.browserContext = await chromium.launchPersistentContext(this.options.profileDir, {
          headless: false,
          args: [
            '--remote-debugging-port=9222',
            '--disable-web-security',
            '--disable-blink-features=AutomationControlled',
            '--device-scale-factor=1.5',
          ],
        });
      } catch (playwrightError: any) {
        if (playwrightError.message?.includes('Executable doesn\'t exist')) {
          const packageManager = detectPackageManager();
          console.log(chalk.yellow('📦 Installing Playwright chromium browser...'));
          await this.installPlaywrightBrowsers();
          
          // Retry with bundled chromium
          this.browserContext = await chromium.launchPersistentContext(this.options.profileDir, {
            headless: false,
            args: [
              '--remote-debugging-port=9222',
              '--disable-web-security',
              '--disable-blink-features=AutomationControlled',
              '--device-scale-factor=1.5',
            ],
          });
        } else {
          throw playwrightError;
        }
      }
    }
    
    // Navigate to the app
    const page = await this.browserContext.newPage();
    await page.goto(`http://localhost:${this.options.port}`);
    
    // Take initial screenshot
    const initialScreenshot = await this.takeScreenshot(page, 'initial-load');
    if (initialScreenshot) {
      this.logger.log('browser', `[SCREENSHOT] ${initialScreenshot}`);
    }
    
    // Set up monitoring
    await this.setupPageMonitoring(page);
    
    // Monitor new pages
    this.browserContext.on('page', async (newPage) => {
      await this.setupPageMonitoring(newPage);
    });
    
    console.log(chalk.green('✅ Browser monitoring active!'));
  }

  private async installPlaywrightBrowsers(): Promise<void> {
    console.log(chalk.blue('⏳ Installing Playwright chromium browser (this may take 2-3 minutes)...'));
    
    return new Promise<void>((resolve, reject) => {
      const packageManager = detectPackageManager();
      const [command, ...args] = packageManager.split(' ');
      
      console.log(chalk.gray(`Running: ${command} ${[...args, 'playwright', 'install', 'chromium'].join(' ')}`));
      
      const installProcess = spawn(command, [...args, 'playwright', 'install', 'chromium'], {
        stdio: ['inherit', 'pipe', 'pipe'],
        shell: true,
      });

      // Add timeout (5 minutes)
      const timeout = setTimeout(() => {
        installProcess.kill('SIGKILL');
        reject(new Error('Playwright installation timed out after 5 minutes'));
      }, 5 * 60 * 1000);

      let hasOutput = false;

      installProcess.stdout?.on('data', (data) => {
        hasOutput = true;
        const message = data.toString().trim();
        if (message) {
          console.log(chalk.gray('[PLAYWRIGHT]'), message);
        }
      });

      installProcess.stderr?.on('data', (data) => {
        hasOutput = true;
        const message = data.toString().trim();
        if (message) {
          console.log(chalk.gray('[PLAYWRIGHT]'), message);
        }
      });

      installProcess.on('exit', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          console.log(chalk.green('✅ Playwright chromium installed successfully!'));
          resolve();
        } else {
          reject(new Error(`Playwright installation failed with exit code ${code}`));
        }
      });

      installProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to start Playwright installation: ${error.message}`));
      });

      // Check if process seems stuck
      setTimeout(() => {
        if (!hasOutput) {
          console.log(chalk.yellow('⚠️  Installation seems stuck. This is normal for the first run - downloading ~100MB...'));
        }
      }, 10000); // Show message after 10 seconds of no output
    });
  }

  private async takeScreenshot(page: Page, event: string): Promise<string | null> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${timestamp}-${event}.png`;
      const screenshotPath = join(this.screenshotDir, filename);
      const mcpScreenshotPath = join(this.mcpPublicDir, filename);
      
      await page.screenshot({ 
        path: screenshotPath,
        fullPage: false, // Just viewport for speed
        animations: 'disabled' // Disable animations during screenshot
      });
      
      // Copy to MCP server public folder for web access
      copyFileSync(screenshotPath, mcpScreenshotPath);
      
      // Return web-accessible URL
      return `http://localhost:${this.options.mcpPort}/screenshots/${filename}`;
    } catch (error) {
      console.error(chalk.red('[SCREENSHOT ERROR]'), error);
      return null;
    }
  }

  private async setupPageMonitoring(page: Page) {
    const url = page.url();
    
    // Only monitor localhost pages
    if (!url.includes(`localhost:${this.options.port}`) && url !== 'about:blank') {
      return;
    }

    this.logger.log('browser', `📄 New page: ${url}`);
    
    // Console logs
    page.on('console', (msg) => {
      if (page.url().includes(`localhost:${this.options.port}`)) {
        const level = msg.type().toUpperCase();
        const text = msg.text();
        this.logger.log('browser', `[CONSOLE ${level}] ${text}`);
      }
    });
    
    // Page errors
    page.on('pageerror', async (error) => {
      if (page.url().includes(`localhost:${this.options.port}`)) {
        const screenshotPath = await this.takeScreenshot(page, 'error');
        this.logger.log('browser', `[PAGE ERROR] ${error.message}`);
        if (screenshotPath) {
          this.logger.log('browser', `[SCREENSHOT] ${screenshotPath}`);
        }
        if (error.stack) {
          this.logger.log('browser', `[PAGE ERROR STACK] ${error.stack}`);
        }
      }
    });
    
    // Network requests
    page.on('request', (request) => {
      if (page.url().includes(`localhost:${this.options.port}`) && !request.url().includes(`localhost:${this.options.mcpPort}`)) {
        this.logger.log('browser', `[NETWORK REQUEST] ${request.method()} ${request.url()}`);
      }
    });
    
    page.on('response', async (response) => {
      if (page.url().includes(`localhost:${this.options.port}`) && !response.url().includes(`localhost:${this.options.mcpPort}`)) {
        const status = response.status();
        const url = response.url();
        if (status >= 400) {
          const screenshotPath = await this.takeScreenshot(page, 'network-error');
          this.logger.log('browser', `[NETWORK ERROR] ${status} ${url}`);
          if (screenshotPath) {
            this.logger.log('browser', `[SCREENSHOT] ${screenshotPath}`);
          }
        }
      }
    });
    
    // Navigation (only screenshot on route changes, not every navigation)
    let lastRoute = '';
    page.on('framenavigated', async (frame) => {
      if (frame === page.mainFrame() && frame.url().includes(`localhost:${this.options.port}`)) {
        const currentRoute = new URL(frame.url()).pathname;
        this.logger.log('browser', `[NAVIGATION] ${frame.url()}`);
        
        // Only screenshot if route actually changed
        if (currentRoute !== lastRoute) {
          const screenshotPath = await this.takeScreenshot(page, 'route-change');
          if (screenshotPath) {
            this.logger.log('browser', `[SCREENSHOT] ${screenshotPath}`);
          }
          lastRoute = currentRoute;
        }
      }
    });
  }

  private setupCleanupHandlers() {
    // Remove cleanup handlers - let processes run independently
    // Only clean up on explicit SIGINT (Ctrl+C)
    process.on('SIGINT', () => {
      console.log(chalk.yellow('\n🛑 Received interrupt signal. Processes will continue running in background.'));
      console.log(chalk.gray('💡 Use "pkill -f dev-playwright" to stop all processes.'));
      process.exit(0);
    });
  }
}

export async function startDevEnvironment(options: DevEnvironmentOptions) {
  const devEnv = new DevEnvironment(options);
  await devEnv.start();
}