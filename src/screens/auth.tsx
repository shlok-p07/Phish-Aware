"use client";
import { useEffect, useRef } from "react";
import { useLocation } from "@/lib/nav";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Shield, Mail, Lock, User, ArrowRight, Ghost } from "lucide-react";
import { useLogin, useSignup, useContinueAsGuest, useGetCurrentUser, getGetCurrentUserQueryKey } from "@/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

const signupSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: user, isLoading } = useGetCurrentUser({
    query: { retry: false, queryKey: getGetCurrentUserQueryKey() },
  });
  
  const loginMutation = useLogin();
  const signupMutation = useSignup();
  const guestMutation = useContinueAsGuest();

  useEffect(() => {
    if (user && !isLoading) {
      setLocation("/dashboard");
    }
  }, [user, isLoading, setLocation]);

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const signupForm = useForm<z.infer<typeof signupSchema>>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  const onLogin = (values: z.infer<typeof loginSchema>) => {
    loginMutation.mutate({ data: values }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
        toast({ title: "Welcome back!" });
      },
      onError: (err: any) => {
        toast({ title: "Login failed", description: err?.message || "Invalid credentials", variant: "destructive" });
      }
    });
  };

  const onSignup = (values: z.infer<typeof signupSchema>) => {
    signupMutation.mutate({ data: values }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
        toast({ title: "Account created!", description: "Welcome to PhishAware." });
      },
      onError: (err: any) => {
        toast({ title: "Signup failed", description: err?.message || "Could not create account", variant: "destructive" });
      }
    });
  };

  const onGuest = () => {
    guestMutation.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
        toast({ title: "Playing as Guest", description: "Your progress will be saved temporarily." });
      },
      onError: () => {
        toast({ title: "Error", description: "Could not start guest session", variant: "destructive" });
      }
    });
  };

  if (isLoading || user) return null;

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center p-4 bg-muted/30">
      <div className="max-w-md w-full space-y-8">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="bg-primary text-primary-foreground p-4 rounded-2xl shadow-md">
            <Shield className="w-10 h-10" />
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-display font-bold tracking-tight text-foreground">PhishAware</h1>
            <p className="text-muted-foreground font-medium text-lg">Build your scam-spotting instincts.</p>
          </div>
        </div>

        <Card className="border-2 shadow-sm">
          <Tabs defaultValue="login" className="w-full">
            <CardHeader className="pb-4">
              <TabsList className="grid w-full grid-cols-2 p-1 bg-muted rounded-xl h-auto">
                <TabsTrigger value="login" className="py-2.5 rounded-lg font-semibold text-base data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm">Log in</TabsTrigger>
                <TabsTrigger value="signup" className="py-2.5 rounded-lg font-semibold text-base data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm">Sign up</TabsTrigger>
              </TabsList>
            </CardHeader>
            <CardContent className="pb-6">
              <TabsContent value="login" className="mt-0">
                <Form {...loginForm}>
                  <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
                    <FormField
                      control={loginForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-semibold text-foreground">Email</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Mail className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                              <Input placeholder="you@example.com" className="pl-10 py-6 rounded-xl bg-muted/50 border-transparent focus-visible:border-primary focus-visible:ring-primary focus-visible:bg-background transition-colors" {...field} />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={loginForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-semibold text-foreground">Password</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                              <Input type="password" placeholder="••••••••" className="pl-10 py-6 rounded-xl bg-muted/50 border-transparent focus-visible:border-primary focus-visible:ring-primary focus-visible:bg-background transition-colors" {...field} />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" className="w-full py-6 text-lg rounded-xl font-bold mt-2 shadow-sm" disabled={loginMutation.isPending}>
                      {loginMutation.isPending ? "Logging in..." : "Log in"}
                    </Button>
                  </form>
                </Form>
              </TabsContent>
              
              <TabsContent value="signup" className="mt-0">
                <Form {...signupForm}>
                  <form onSubmit={signupForm.handleSubmit(onSignup)} className="space-y-4">
                    <FormField
                      control={signupForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-semibold text-foreground">First Name</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <User className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                              <Input placeholder="Alex" className="pl-10 py-6 rounded-xl bg-muted/50 border-transparent focus-visible:border-primary focus-visible:ring-primary focus-visible:bg-background transition-colors" {...field} />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={signupForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-semibold text-foreground">Email</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Mail className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                              <Input placeholder="you@example.com" className="pl-10 py-6 rounded-xl bg-muted/50 border-transparent focus-visible:border-primary focus-visible:ring-primary focus-visible:bg-background transition-colors" {...field} />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={signupForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-semibold text-foreground">Password</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                              <Input type="password" placeholder="••••••••" className="pl-10 py-6 rounded-xl bg-muted/50 border-transparent focus-visible:border-primary focus-visible:ring-primary focus-visible:bg-background transition-colors" {...field} />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" className="w-full py-6 text-lg rounded-xl font-bold mt-2 shadow-sm" disabled={signupMutation.isPending}>
                      {signupMutation.isPending ? "Creating account..." : "Start playing"}
                    </Button>
                  </form>
                </Form>
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>

        <div className="flex flex-col space-y-4">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t-2 border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase font-bold tracking-wider">
              <span className="bg-muted/30 px-4 text-muted-foreground">Or just try it out</span>
            </div>
          </div>

          <Button 
            variant="outline" 
            size="lg" 
            className="w-full py-6 rounded-xl border-2 hover:bg-muted font-bold text-base" 
            onClick={onGuest}
            disabled={guestMutation.isPending}
          >
            <Ghost className="mr-2 h-5 w-5" />
            Continue as Guest
            <ArrowRight className="ml-auto h-5 w-5 opacity-50" />
          </Button>
        </div>
      </div>
    </div>
  );
}