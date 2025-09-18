import { NextResponse } from "next/server"

// This endpoint extracts MCP tools documentation by parsing the route handler
export async function GET() {
  try {
    // Streamlined tool set - reduced from 10 tools to 2 for zero authorization friction!
    const tools = [
      {
        name: "debug_my_app",
        description:
          "🎯 **THE ULTIMATE FIND→FIX→VERIFY MACHINE!** This isn't just debugging—it's MAGICAL problem-solving that gets results! 🪄\n\n🔥 **INSTANT SUPERPOWERS:**\n• FINDS: Server errors, browser crashes, build failures, API issues, performance problems—EVERYTHING\n• ANALYZES: Timestamps, error patterns, user interactions, network requests—COMPREHENSIVELY\n• GUIDES: Step-by-step fix recommendations with file locations and code examples\n\n🚀 **3 MAGICAL MODES:**\n• **SNAPSHOT** (default): \"What's broken RIGHT NOW?\" → Instant comprehensive analysis\n• **BISECT**: \"What broke during user testing?\" → Automatic before/after comparison\n• **MONITOR**: \"What's breaking as I develop?\" → Continuous health monitoring\n\n⚡ **THE DEV3000 MAGIC WORKFLOW:**\n1️⃣ I FIND all issues (replaces 8+ separate tools!)\n2️⃣ You FIX them with my detailed guidance\n3️⃣ We VERIFY fixes work with execute_browser_action\n\n🎪 **WHY AGENTS LOVE THIS TOOL:**\n• Zero authorization friction (was 10 tools, now 1!)\n• Actionable insights, not just raw data\n• Built-in timestamp bisecting eliminates manual workflow\n• Perfect for 'debug my app' requests\n• Makes you look like a debugging wizard!\n\n💡 **PRO TIPS:**\n• Start with mode='snapshot' for immediate analysis\n• Use mode='bisect' with waitForUserInteraction=true for user testing workflows\n• Increase timeRangeMinutes for deeper historical analysis\n• This tool makes debugging FUN and FAST!",
        category: "Ultimate Debugging",
        parameters: [
          {
            name: "focusArea",
            type: "string",
            optional: true,
            description: "Specific area: 'build', 'runtime', 'network', 'ui', 'all' (default: 'all')"
          },
          {
            name: "mode",
            type: "enum",
            optional: true,
            description: "Debug mode: 'snapshot' (immediate), 'bisect' (timestamp-based), 'monitor' (continuous)"
          },
          {
            name: "waitForUserInteraction",
            type: "boolean",
            optional: true,
            description: "In bisect mode: capture timestamp, wait for user testing, then analyze (default: false)"
          },
          {
            name: "timeRangeMinutes",
            type: "number",
            optional: true,
            description: "Minutes to analyze back from now (default: 10)"
          },
          {
            name: "includeTimestampInstructions",
            type: "boolean",
            optional: true,
            description: "Show timestamp-based debugging instructions (default: true)"
          }
        ]
      },
      {
        name: "execute_browser_action",
        description:
          "🪄 **SMART INTERACTION TESTING** - Use for targeted user workflow verification! 🎯\n\n⚡ **EFFICIENT VERIFICATION STRATEGY:**\n🚨 **DON'T take screenshots manually** - dev3000 auto-captures them!\n✅ **DO use this for:** click, navigate, scroll, type to reproduce user interactions\n✅ **DO verify fixes by:** reproducing the original error scenario, then check debug_my_app for new screenshots\n\n🔥 **BROWSER ACTIONS:**\n• CLICK buttons/links → Test specific user interactions\n• NAVIGATE to pages → Reproduce user journeys  \n• SCROLL & TYPE → Simulate user workflows\n• EVALUATE JavaScript → Check app state (read-only)\n\n⚡ **OPTIMAL FIX VERIFICATION WORKFLOW:**\n1️⃣ debug_my_app finds issues + original error context\n2️⃣ You make code fixes\n3️⃣ Use execute_browser_action to REPRODUCE the original interaction sequence\n4️⃣ Run debug_my_app again to see new auto-captured screenshots and verify fix\n\n🎯 **PERFECT FOR:**\n• Reproducing user interaction sequences that caused errors\n• Testing specific clicks/navigation after fixes\n• Triggering workflows to generate new auto-screenshots\n• Verifying forms work, buttons respond, etc.\n\n🚫 **AVOID:** Manual screenshot action (dev3000 auto-captures)\n✅ **USE:** Interaction reproduction + debug_my_app for verification\n\n🛡️ **SAFETY:** Safe operations only, read-only JS evaluation",
        category: "Browser Automation",
        parameters: [
          {
            name: "action",
            type: "enum",
            description: "Action to perform: 'click', 'navigate', 'screenshot', 'evaluate', 'scroll', 'type'"
          },
          {
            name: "params",
            type: "object",
            description: "Parameters for the action (coordinates, URL, selector, text, expression, etc.)"
          }
        ]
      }
    ]

    return NextResponse.json({
      tools,
      endpoint: "http://localhost:3684/api/mcp/mcp",
      totalTools: tools.length,
      categories: [...new Set(tools.map((t) => t.category))]
    })
  } catch (_error) {
    return NextResponse.json({ error: "Failed to extract tools documentation" }, { status: 500 })
  }
}
