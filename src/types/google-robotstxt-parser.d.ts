declare module "google-robotstxt-parser" {
  export class RobotsParseHandler {
    handleRobotsStart(): void;
    handleRobotsEnd(): void;
    handleUserAgent(lineNum: number, value: string): void;
    handleAllow(lineNum: number, value: string): void;
    handleDisallow(lineNum: number, value: string): void;
    handleSitemap(lineNum: number, value: string): void;
    handleUnknownAction(lineNum: number, action: string, value: string): void;
  }

  export class RobotsMatcher extends RobotsParseHandler {
    oneAgentAllowedByRobots(robotsTxt: string, userAgent: string, url: string): boolean;
    everSeenSpecificAgent(): boolean;
    matchingLine(): number;
  }

  export function parseRobotsTxt(robotsBody: string, handler: RobotsParseHandler): void;
}
