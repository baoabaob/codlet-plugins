// Research only: one exact new suspended child, one reviewed DLL, one data byte.
// This is not a production launcher or a general process patch command.
using System;
using System.IO;
using System.Text;
using System.Diagnostics;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Cryptography;

public static class StartupProbe {
    const string DllHash="b6f5c2323c642c3ad3dfdc3501aa94482970f88b4c12db0875ce593aece75c16";
    [StructLayout(LayoutKind.Explicit,Size=176)] struct DebugEvent {
        [FieldOffset(0)]public uint Code; [FieldOffset(4)]public uint Pid; [FieldOffset(8)]public uint Tid;
        [FieldOffset(16)]public IntPtr File; [FieldOffset(24)]public IntPtr Base;
        [FieldOffset(16)]public uint ExceptionCode;
    }
    [DllImport("kernel32.dll",SetLastError=true)]static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
    [DllImport("kernel32.dll",SetLastError=true)]static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll",SetLastError=true)]static extern bool GetProcessTimes(IntPtr process,out long creation,out long exit,out long kernel,out long user);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool QueryFullProcessImageName(IntPtr process,uint flags,StringBuilder path,ref uint size);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern uint GetFinalPathNameByHandle(IntPtr file,StringBuilder path,uint size,uint flags);
    [DllImport("kernel32.dll",SetLastError=true)]static extern bool DebugActiveProcess(uint pid);
    [DllImport("kernel32.dll",SetLastError=true)]static extern bool DebugActiveProcessStop(uint pid);
    [DllImport("kernel32.dll",SetLastError=true)]static extern bool DebugSetProcessKillOnExit(bool kill);
    [DllImport("kernel32.dll",SetLastError=true)]static extern bool WaitForDebugEvent(out DebugEvent debugEvent,uint timeout);
    [DllImport("kernel32.dll",SetLastError=true)]static extern bool ContinueDebugEvent(uint pid,uint tid,uint status);
    [DllImport("kernel32.dll",SetLastError=true)]static extern bool ReadProcessMemory(IntPtr process,IntPtr address,byte[] buffer,UIntPtr size,out UIntPtr read);
    [DllImport("kernel32.dll",SetLastError=true)]static extern bool WriteProcessMemory(IntPtr process,IntPtr address,byte[] buffer,UIntPtr size,out UIntPtr written);
    [DllImport("kernel32.dll",SetLastError=true)]static extern bool VirtualProtectEx(IntPtr process,IntPtr address,UIntPtr size,uint protection,out uint oldProtection);
    static void Check(bool value,string operation){if(!value)throw new Win32Exception(Marshal.GetLastWin32Error(),operation);}
    static string Normal(string path){return Path.GetFullPath(path.StartsWith("\\\\?\\")?path.Substring(4):path);}
    static byte[] Read(IntPtr process,IntPtr address,int count){byte[] data=new byte[count];UIntPtr done;Check(ReadProcessMemory(process,address,data,(UIntPtr)count,out done),"read owned image");if(done.ToUInt64()!=(ulong)count)throw new Exception("partial read");return data;}
    static long FuseRva(FileStream file){
        // Offset is valid ONLY after checking the complete reviewed file hash.
        const int found=281415264;var reader=new BinaryReader(file);file.Position=found;
        if(Encoding.ASCII.GetString(reader.ReadBytes(32))!="dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX"||reader.ReadByte()!=1||reader.ReadByte()!=9||Encoding.ASCII.GetString(reader.ReadBytes(9))!="010011001")throw new Exception("unexpected fuse wire");
        int raw=found+32+2+3;file.Position=0x3c;int pe=reader.ReadInt32();if(pe<0||pe>65536)throw new Exception("unexpected PE header");
        file.Position=pe;if(reader.ReadUInt32()!=0x4550||reader.ReadUInt16()!=0x8664)throw new Exception("unexpected PE");
        int count=reader.ReadUInt16();file.Position=pe+20;int section=pe+24+reader.ReadUInt16();
        for(int i=0;i<count;i++,section+=40){file.Position=section+12;uint rva=reader.ReadUInt32(),size=reader.ReadUInt32(),start=reader.ReadUInt32();if(raw>=start&&raw<start+size)return rva+(raw-start);}
        throw new Exception("fuse outside image sections");
    }
    static void WriteByte(IntPtr process,IntPtr address,byte expected,byte value){
        if(Read(process,address,1)[0]!=expected)throw new Exception("unexpected mapped fuse");
        uint previous;Check(VirtualProtectEx(process,address,(UIntPtr)1,4,out previous),"protect owned data byte");
        try{UIntPtr written;Check(WriteProcessMemory(process,address,new byte[]{value},(UIntPtr)1,out written),"write owned data byte");if(written.ToUInt64()!=1||Read(process,address,1)[0]!=value)throw new Exception("write not verified");}
        finally{uint ignored;Check(VirtualProtectEx(process,address,(UIntPtr)1,previous,out ignored),"restore page protection");}
    }
    public static int Main(string[] args){
        if(args.Length!=4||IntPtr.Size!=8)return 2;
        uint pid=uint.Parse(args[0]);long created=long.Parse(args[1]);string image=Normal(args[2]),receipt=args[3];
        if(!Path.IsPathRooted(receipt)||Path.GetFileName(receipt)!="native-bootstrap.json"||
           !File.Exists(Path.Combine(Path.GetDirectoryName(receipt),"owner.txt"))||
           File.ReadAllText(Path.Combine(Path.GetDirectoryName(receipt),"owner.txt"))!="codlet-desktop-acceptance\n"||
           File.Exists(receipt)||File.Exists(receipt+".restore"))return 2;
        IntPtr process=IntPtr.Zero,patchAddress=IntPtr.Zero;bool attached=false,patched=false,initialBreak=false;var watch=Stopwatch.StartNew();
        try{
            process=OpenProcess(0x1fffff,false,pid);Check(process!=IntPtr.Zero,"open exact child");
            long actual,exit,kernel,user;Check(GetProcessTimes(process,out actual,out exit,out kernel,out user),"creation identity");if(actual!=created)throw new Exception("wrong creation identity");
            long age=DateTime.UtcNow.ToFileTimeUtc()-actual;if(age<0||age>TimeSpan.FromSeconds(10).Ticks)throw new Exception("child is not newly created");
            var name=new StringBuilder(32768);uint size=32768;Check(QueryFullProcessImageName(process,0,name,ref size),"image identity");if(!String.Equals(Normal(name.ToString()),image,StringComparison.OrdinalIgnoreCase))throw new Exception("wrong image");
            string dll=Path.Combine(Path.GetDirectoryName(image),"chrome.dll");long rva;
            using(var file=File.OpenRead(dll)){
                string hash;using(var sha=SHA256.Create()){hash=BitConverter.ToString(sha.ComputeHash(file)).Replace("-","").ToLowerInvariant();}
                if(hash!=DllHash)throw new Exception("unreviewed DLL");rva=FuseRva(file);
            }
            Check(DebugActiveProcess(pid),"attach new suspended child");attached=true;
            Check(DebugSetProcessKillOnExit(true),"owned failure cleanup");
            Console.WriteLine("armed");Console.Out.Flush();
            while(watch.ElapsedMilliseconds<12000){
                DebugEvent e;if(!WaitForDebugEvent(out e,100)){int err=Marshal.GetLastWin32Error();if(err==121)continue;throw new Win32Exception(err,"wait debug event");}
                uint disposition=0x10002;
                try{
                    if(e.Pid!=pid)throw new Exception("unexpected process event");
                    if(e.Code==6&&e.File!=IntPtr.Zero){
                        var loaded=new StringBuilder(32768);uint n=GetFinalPathNameByHandle(e.File,loaded,32768,0);Check(n>0&&n<32768,"loaded module identity");
                        if(String.Equals(Normal(loaded.ToString()),dll,StringComparison.OrdinalIgnoreCase)){
                            patchAddress=new IntPtr(e.Base.ToInt64()+rva);WriteByte(process,patchAddress,0x30,0x31);
                            patched=true;
                        }
                    }
                    if(e.Code==1){if(e.ExceptionCode==0x80000003&&!initialBreak)initialBreak=true;else disposition=0x80010001;}
                    if(e.Code==5)throw new Exception("child exited before bootstrap");
                }finally{
                    if((e.Code==6||e.Code==3)&&e.File!=IntPtr.Zero)CloseHandle(e.File);
                    Check(ContinueDebugEvent(e.Pid,e.Tid,disposition),"continue owned event");
                }
                if(patched&&initialBreak){Check(DebugActiveProcessStop(pid),"detach native debugger");attached=false;
                    long bootstrapMs=watch.ElapsedMilliseconds;
                    while(!File.Exists(receipt+".restore")&&watch.ElapsedMilliseconds<12000)System.Threading.Thread.Sleep(10);
                    WriteByte(process,patchAddress,0x31,0x30);
                    bool requested=File.Exists(receipt+".restore");
                    File.WriteAllText(receipt,"{\"patchedMemoryBytes\":1,\"diskBytesChanged\":0,\"detached\":true,\"restored\":true,\"restoreRequested\":"+requested.ToString().ToLowerInvariant()+",\"elapsedMs\":"+bootstrapMs+",\"totalMs\":"+watch.ElapsedMilliseconds+",\"helperPeakWorkingSet\":"+Process.GetCurrentProcess().PeakWorkingSet64+"}");return requested?0:1;}
            }
            throw new Exception("bootstrap deadline");
        }catch(Exception e){File.WriteAllText(receipt,"{\"error\":\""+e.Message.Replace("\\","/").Replace("\"","'")+"\",\"patched\":"+patched.ToString().ToLowerInvariant()+",\"attached\":"+attached.ToString().ToLowerInvariant()+"}");return 1;}
        finally{if(process!=IntPtr.Zero)CloseHandle(process);}
    }
}
