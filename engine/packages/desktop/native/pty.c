#include <util.h>
#include <sys/ioctl.h>
#include <sys/select.h>
#include <sys/wait.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <signal.h>
#include <errno.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

static pid_t child = -1;
static volatile sig_atomic_t interrupted = 0;
static void request_stop(int sig) { interrupted = sig; if (child > 0) kill(-child, sig); }
static void signal_groups(pid_t foreground, int sig) {
  if(child > 0) kill(-child,sig);
  if(foreground > 0 && foreground != child) kill(-foreground,sig);
}
static int group_alive(pid_t group) { return group > 0 && (kill(-group,0) == 0 || errno != ESRCH); }
static int finish(int master) {
  pid_t foreground=tcgetpgrp(master); int status=0,reaped=0;
  close(master); signal_groups(foreground,SIGHUP);
  // A shell can ignore HUP (or be waiting for a job which does). Closing its
  // helper alone would orphan it, so terminate and reap our own groups first.
  for(int step=0;step<75;step++) {
    if(!reaped) { pid_t result=waitpid(child,&status,WNOHANG); if(result==child || (result<0 && errno==ECHILD)) reaped=1; }
    if(reaped && !group_alive(child) && !group_alive(foreground)) break;
    if(step==25) signal_groups(foreground,SIGTERM);
    if(step==50) signal_groups(foreground,SIGKILL);
    usleep(20000);
  }
  if(!reaped) { signal_groups(foreground,SIGKILL); while(waitpid(child,&status,0)<0 && errno==EINTR) {} }
  return WIFEXITED(status)?WEXITSTATUS(status):128+(WIFSIGNALED(status)?WTERMSIG(status):0);
}
static int write_all(int fd, const void *buf, size_t n) {
  const char *p = buf;
  while(n) { if(interrupted)return -1;ssize_t sent = write(fd,p,n); if(sent < 0 && errno == EINTR) continue; if(sent <= 0) return -1; p += sent; n -= sent; }
  return 0;
}
int main(int argc, char **argv) {
  if(argc < 3) return 64;
  int master; struct winsize size = {.ws_row = 24, .ws_col = 80};
  child = forkpty(&master, NULL, NULL, &size);
  if(child < 0) { perror("forkpty"); return 71; }
  if(child == 0) {
    if(chdir(argv[1]) != 0) { perror("chdir"); _exit(72); }
    setenv("TERM", "xterm-256color", 1); setenv("COLORTERM", "truecolor", 1);
    if(argc > 3) execv(argv[2], &argv[2]); else execl(argv[2], argv[2], "-l", (char *)NULL);
    perror("exec"); _exit(127);
  }
  struct sigaction action;memset(&action,0,sizeof(action));action.sa_handler=request_stop;sigemptyset(&action.sa_mask);
  sigaction(SIGTERM,&action,NULL);sigaction(SIGHUP,&action,NULL);sigaction(SIGINT,&action,NULL);signal(SIGPIPE,SIG_IGN);
  unsigned char pending[1048581]; size_t used = 0; int forced_status = -1;
  for(;;) {
    if(interrupted)break;
    fd_set fds; FD_ZERO(&fds); FD_SET(master,&fds); FD_SET(STDIN_FILENO,&fds);
    if(select(master+1,&fds,NULL,NULL,NULL) < 0) { if(errno == EINTR) continue; break; }
    if(FD_ISSET(master,&fds)) {
      char output[16384]; ssize_t n=read(master,output,sizeof(output));
      if(n<=0) break; if(write_all(STDOUT_FILENO,output,(size_t)n)) break;
    }
    if(FD_ISSET(STDIN_FILENO,&fds)) {
      ssize_t n=read(STDIN_FILENO,pending+used,sizeof(pending)-used); if(n<=0) break; used+=(size_t)n;
      while(used>=5) {
        uint32_t len; memcpy(&len,pending+1,4); len=ntohl(len); if(len>1048576) { forced_status=65;goto done; }
        if(used<5+len) break;
        if(pending[0]=='I') { if(write_all(master,pending+5,len)) goto done; }
        else if(pending[0]=='R' && len==4) { uint16_t cols,rows; memcpy(&cols,pending+5,2); memcpy(&rows,pending+7,2); size.ws_col=ntohs(cols);size.ws_row=ntohs(rows);ioctl(master,TIOCSWINSZ,&size); }
        else if(pending[0]=='Q') goto done;
        memmove(pending,pending+5+len,used-5-len); used-=5+len;
      }
    }
  }
done:
  {int status=finish(master);return forced_status>=0?forced_status:status;}
}
